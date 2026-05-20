import axios from 'axios';
import path from 'path';
import AdmZip from 'adm-zip';
import HealthRecord from '../models/HealthRecord.js';
import FormData from 'form-data';

// In-memory map: userId → { phase: 'received'|'processing'|'done'|'error', startedAt }
// Cleared 60s after completion so stale entries don't persist across restarts
const processingState = new Map();

export function getProcessingState(userId) {
    return processingState.get(String(userId)) ?? null;
}

function setState(userId, phase) {
    processingState.set(String(userId), { phase, startedAt: Date.now() });
    if (phase === 'done' || phase === 'error') {
        setTimeout(() => processingState.delete(String(userId)), 60000);
    }
}

const ML_RETRIES = 3;
const ML_RETRY_DELAY_MS = 15000; // 15s between retries — gives cold-start time to complete

// Fire-and-forget: runs after 202 is sent so Render's 30s timeout never applies
async function processXmlInBackground(xmlBuffer, userId) {
    setState(userId, 'processing');

    const mlEngineUrl = process.env.ML_ENGINE_URL || 'http://localhost:8000';
    console.log(`📤 [BG] Sending XML payload (${xmlBuffer.length} bytes) to ML engine at: ${mlEngineUrl}/process-xml`);

    let pythonResponse;
    let lastErr;
    for (let attempt = 1; attempt <= ML_RETRIES; attempt++) {
        // Fresh FormData per attempt — streams can only be consumed once
        const form = new FormData();
        form.append('file', xmlBuffer, { filename: 'export.xml', contentType: 'text/xml' });
        try {
            pythonResponse = await axios.post(`${mlEngineUrl}/process-xml`, form, {
                headers: form.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 600000, // 10 min per attempt
            });
            lastErr = null;
            break; // success
        } catch (err) {
            lastErr = err;
            console.error(`[BG] ML engine attempt ${attempt}/${ML_RETRIES} failed: ${err.message}`);
            if (attempt < ML_RETRIES) {
                console.log(`[BG] Retrying in ${ML_RETRY_DELAY_MS / 1000}s…`);
                await new Promise(r => setTimeout(r, ML_RETRY_DELAY_MS));
            }
        }
    }

    if (lastErr) {
        console.error(`[BG] All ${ML_RETRIES} ML engine attempts failed.`);
        setState(userId, 'error');
        return;
    }

    let cleanedData = pythonResponse.data;
    if (cleanedData.data && Array.isArray(cleanedData.data)) {
        cleanedData = cleanedData.data;
    }
    if (!Array.isArray(cleanedData)) {
        console.error('[BG] ML engine returned unexpected format:', typeof cleanedData);
        setState(userId, 'error');
        return;
    }

    const recordsToSave = cleanedData.map(record => ({
        userId,
        type: record.type,
        value: parseFloat(record.value),
        unit: record.unit,
        startDate: new Date(record.startDate),
        endDate: new Date(record.endDate),
    }));

    if (recordsToSave.length > 0) {
        try {
            await HealthRecord.insertMany(recordsToSave, { ordered: false });
            console.log(`[BG] Saved ${recordsToSave.length} records for user ${userId}`);
        } catch (err) {
            if (err.code !== 11000 && !err.writeErrors) {
                console.error('[BG] DB insert error:', err.message);
                setState(userId, 'error');
                return;
            }
            console.log(`[BG] Skipped duplicate metrics.`);
        }
    } else {
        console.log(`[BG] ML engine returned 0 matching records for user ${userId}`);
    }

    setState(userId, 'done');
}

export const handleUpload = async (req, res) => {
    // Always use the authenticated user's id — don't trust body.userId
    // (upload-token auth sets req.user; JWT auth sets req.user; both paths land here)
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = req.user._id.toString();

    // Optional: if caller explicitly sends userId, verify it matches (extra guard for JWT path)
    const providedUserId = req.body.userId;
    if (providedUserId && providedUserId !== userId) {
        return res.status(403).json({
            error: 'Security Breach: Authenticated user does not match target userId'
        });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    let xmlBuffer;
    try {
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        if (fileExt === '.zip') {
            const zip = new AdmZip(req.file.buffer);
            const zipEntries = zip.getEntries();
            // Case-insensitive match — Apple Health uses export.xml but some versions vary
            const xmlEntry = zipEntries.find(entry =>
                entry.entryName.toLowerCase().endsWith('export.xml')
            );
            if (!xmlEntry) {
                return res.status(400).json({ error: 'Invalid ZIP: Could not find export.xml inside the archive.' });
            }
            xmlBuffer = xmlEntry.getData();
        } else {
            xmlBuffer = req.file.buffer;
        }
    } catch (error) {
        return res.status(400).json({ error: 'Failed to read uploaded file.', details: error.message });
    }

    // Mark upload as received so the frontend polling can show a progress bar immediately
    setState(userId, 'received');

    // Respond immediately so Render's 30-second gateway timeout is never hit.
    // The frontend will poll /api/health/status until records appear in the DB.
    res.status(202).json({ message: 'File received. Processing in background — poll /api/health/status for completion.' });

    // Kick off the heavy work after the response is flushed
    setImmediate(() => {
        processXmlInBackground(xmlBuffer, userId).catch(err =>
            console.error('[BG] Unhandled background error:', err.message)
        );
    });
};
