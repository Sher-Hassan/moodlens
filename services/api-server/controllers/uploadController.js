import axios from 'axios';
import path from 'path';
import AdmZip from 'adm-zip';
import HealthRecord from '../models/HealthRecord.js';

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

    try {
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let xmlBuffer;

        if (fileExt === '.zip') {
            // Unzip entirely inside RAM memory
            const zip = new AdmZip(req.file.buffer);
            const zipEntries = zip.getEntries();
            const xmlEntry = zipEntries.find(entry => entry.entryName.endsWith('export.xml'));

            if (!xmlEntry) {
                throw new Error('Invalid ZIP: Could not find export.xml inside the archive.');
            }
            xmlBuffer = xmlEntry.getData();
        } else {
            // Already a raw XML buffer
            xmlBuffer = req.file.buffer;
        }

        // Build a native multi-part form payload to stream the file across the web network
        const mlEngineUrl = process.env.ML_ENGINE_URL || 'http://localhost:8000';
        const streamForm = new FormData();
        const xmlBlob = new Blob([xmlBuffer], { type: 'text/xml' });
        
        // Append the binary blob directly
        streamForm.append('file', xmlBlob, 'export.xml');

        console.log(`📤 Streaming XML payload directly to ML engine at: ${mlEngineUrl}/process-xml`);

        const pythonResponse = await axios.post(`${mlEngineUrl}/process-xml`, streamForm, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        let cleanedData = pythonResponse.data;

        if (cleanedData.data && Array.isArray(cleanedData.data)) {
            cleanedData = cleanedData.data;
        }

        if (!Array.isArray(cleanedData)) {
            throw new Error('Python service returned an unexpected object format instead of an array.');
        }

        const recordsToSave = cleanedData.map(record => ({
            userId: userId,
            type: record.type,
            value: parseFloat(record.value),
            unit: record.unit,
            startDate: new Date(record.startDate),
            endDate: new Date(record.endDate)
        }));

        if (recordsToSave.length > 0) {
            try {
                await HealthRecord.insertMany(recordsToSave, { ordered: false });
            } catch (err) {
                if (err.code !== 11000 && !err.writeErrors) {
                    throw err;
                }
                console.log(`Skipped duplicate metrics.`);
            }
        }

        return res.status(200).json({
            message: 'Data successfully processed. New records added, duplicates skipped.',
            userId: userId,
            processedCount: recordsToSave.length
        });

    } catch (error) {
        console.error('Hand-off Error:', error.message);
        return res.status(500).json({
            error: 'Failed to process and store health data',
            details: error.message
        });
    }
};
