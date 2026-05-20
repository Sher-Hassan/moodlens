import path from 'path';
import AdmZip from 'adm-zip';
import HealthRecord from '../models/HealthRecord.js';
import User from '../models/User.js';

// ── Processing state persisted to DB (survives Render cold starts) ──────────

async function setState(userId, phase, errorMsg = null) {
    await User.findByIdAndUpdate(userId, {
        processingPhase: phase,
        processingStartedAt: phase === 'received' ? new Date() : undefined,
        processingError: errorMsg,
    });
}

export async function getProcessingState(userId) {
    const user = await User.findById(userId).select('processingPhase processingStartedAt processingError');
    if (!user?.processingPhase) return null;
    // Auto-expire stale states older than 20 minutes (handles crashed background jobs)
    const age = Date.now() - (user.processingStartedAt?.getTime() ?? 0);
    if (age > 20 * 60 * 1000 && user.processingPhase !== 'done') {
        await User.findByIdAndUpdate(userId, { processingPhase: null, processingError: null });
        return null;
    }
    return { phase: user.processingPhase, startedAt: user.processingStartedAt, error: user.processingError };
}

// ── Native Node.js Apple Health XML parser ───────────────────────────────────
// Replaces the ML engine hop entirely — no network call, no cold-start timeout.

const TARGET_TYPES = new Set([
    'HKCategoryTypeIdentifierSleepAnalysis',
    'HKQuantityTypeIdentifierStepCount',
    'HKQuantityTypeIdentifierActiveEnergyBurned',
]);

function parseAppleHealthXml(buffer) {
    const xml = buffer.toString('utf8');
    const records = [];

    // Stream through every <Record .../> tag with a single pass regex
    const tagRe = /<Record\b([^>]*?)(?:\/?>)/g;
    const attrRe = /(\w+)="([^"]*)"/g;

    let match;
    while ((match = tagRe.exec(xml)) !== null) {
        const attrStr = match[1];
        const attrs = {};
        let a;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(attrStr)) !== null) attrs[a[1]] = a[2];

        if (!TARGET_TYPES.has(attrs.type)) continue;

        const startDate = new Date(attrs.startDate);
        const endDate   = new Date(attrs.endDate);
        if (isNaN(startDate) || isNaN(endDate)) continue;

        let value;
        if (attrs.type === 'HKCategoryTypeIdentifierSleepAnalysis') {
            value = (endDate - startDate) / 3600000; // ms → hours
        } else {
            value = parseFloat(attrs.value);
            if (isNaN(value)) continue;
        }

        records.push({
            type:      attrs.type,
            value:     Math.round(value * 100) / 100,
            unit:      attrs.unit || '',
            startDate,
            endDate,
        });
    }
    return records;
}

// ── Background processor ─────────────────────────────────────────────────────

async function processXmlInBackground(xmlBuffer, userId) {
    await setState(userId, 'processing');
    console.log(`⚙️  [BG] Parsing XML (${xmlBuffer.length} bytes) in-process for user ${userId}`);

    let records;
    try {
        records = parseAppleHealthXml(xmlBuffer);
        console.log(`[BG] Parsed ${records.length} matching records`);
    } catch (err) {
        console.error('[BG] XML parse error:', err.message);
        await setState(userId, 'error', `XML parse failed: ${err.message}`);
        return;
    }

    if (records.length > 0) {
        const toSave = records.map(r => ({ userId, ...r }));
        try {
            await HealthRecord.insertMany(toSave, { ordered: false });
            console.log(`[BG] Saved ${toSave.length} records for user ${userId}`);
        } catch (err) {
            if (err.code !== 11000 && !err.writeErrors) {
                console.error('[BG] DB insert error:', err.message);
                await setState(userId, 'error', `DB insert failed: ${err.message}`);
                return;
            }
            console.log(`[BG] Skipped duplicate records`);
        }
    } else {
        console.log(`[BG] 0 matching records found for user ${userId}`);
    }

    await setState(userId, 'done');
    // Clear done state after 2 min so it doesn't block the next upload
    setTimeout(() => User.findByIdAndUpdate(userId, { processingPhase: null }).catch(() => {}), 120000);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const handleUpload = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const userId = req.user._id.toString();

    const providedUserId = req.body.userId;
    if (providedUserId && providedUserId !== userId) {
        return res.status(403).json({ error: 'Authenticated user does not match target userId' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    let xmlBuffer;
    try {
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        if (fileExt === '.zip') {
            const zip = new AdmZip(req.file.buffer);
            const xmlEntry = zip.getEntries().find(e =>
                e.entryName.toLowerCase().endsWith('export.xml')
            );
            if (!xmlEntry) {
                return res.status(400).json({ error: 'Invalid ZIP: could not find export.xml inside the archive.' });
            }
            xmlBuffer = xmlEntry.getData();
        } else {
            xmlBuffer = req.file.buffer;
        }
    } catch (err) {
        return res.status(400).json({ error: 'Failed to read uploaded file.', details: err.message });
    }

    await setState(userId, 'received');

    res.status(202).json({ message: 'File received. Processing in background.' });

    setImmediate(() => {
        processXmlInBackground(xmlBuffer, userId).catch(err =>
            console.error('[BG] Unhandled error:', err.message)
        );
    });
};
