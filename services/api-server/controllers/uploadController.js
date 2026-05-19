import axios from 'axios';
import path from 'path';
import AdmZip from 'adm-zip';
import HealthRecord from '../models/HealthRecord.js';
import FormData from 'form-data';

// Fire-and-forget: runs after 202 is sent so Render's 30s timeout never applies
async function processXmlInBackground(xmlBuffer, userId) {
    const mlEngineUrl = process.env.ML_ENGINE_URL || 'http://localhost:8000';
    const streamForm = new FormData();
    streamForm.append('file', xmlBuffer, {
        filename: 'export.xml',
        contentType: 'text/xml',
    });

    console.log(`📤 [BG] Streaming XML payload (${xmlBuffer.length} bytes) to ML engine at: ${mlEngineUrl}/process-xml`);

    let pythonResponse;
    try {
        pythonResponse = await axios.post(`${mlEngineUrl}/process-xml`, streamForm, {
            headers: streamForm.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000, // 10 min — ML engine cold-start on free tier can be slow
        });
    } catch (err) {
        console.error(`[BG] ML engine request failed: ${err.message}`);
        return;
    }

    let cleanedData = pythonResponse.data;
    if (cleanedData.data && Array.isArray(cleanedData.data)) {
        cleanedData = cleanedData.data;
    }
    if (!Array.isArray(cleanedData)) {
        console.error('[BG] ML engine returned unexpected format:', typeof cleanedData);
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
            } else {
                console.log(`[BG] Skipped duplicate metrics.`);
            }
        }
    }
}

export const handleUpload = async (req, res) => {
    const { userId } = req.body;

    if (!req.user || req.user._id.toString() !== userId) {
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
            const xmlEntry = zipEntries.find(entry => entry.entryName.endsWith('export.xml'));
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
