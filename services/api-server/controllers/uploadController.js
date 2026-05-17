import axios from 'axios';
import path from 'path';
import fs from 'fs';
import os from 'os'; // Use OS temp folder, guaranteed to exist on Render, Linux, Mac, and Windows
import AdmZip from 'adm-zip';
import HealthRecord from '../models/HealthRecord.js';

export const handleUpload = async (req, res) => {
    const { userId } = req.body;

    if (!req.user || req.user._id.toString() !== userId) {
        return res.status(403).json({
            error: 'Security Breach: Authenticated user does not match target userId'
        });
    }

    // Check if file was uploaded to memory
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    let tempXmlPath = null;

    try {
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        if (fileExt === '.zip') {
            // --- IN-MEMORY ZIP HANDLING ---
            // Adm-zip can read directly from the memory buffer! No unzipping to local project folders.
            const zip = new AdmZip(req.file.buffer);
            const zipEntries = zip.getEntries();

            // Find export.xml inside the zip archive
            const xmlEntry = zipEntries.find(entry => entry.entryName.endsWith('export.xml'));

            if (!xmlEntry) {
                throw new Error('Invalid ZIP: Could not find export.xml inside the archive.');
            }

            // Extract the XML data inside RAM directly into a buffer
            const xmlBuffer = xmlEntry.getData();
            
            // Create a short-lived file in the system temp directory for the Python engine
            tempXmlPath = path.join(os.tmpdir(), `${uniqueSuffix}-export.xml`);
            fs.writeFileSync(tempXmlPath, xmlBuffer);
        } else {
            // --- RAW XML HANDLING ---
            // The file is already a raw XML file inside req.file.buffer
            tempXmlPath = path.join(os.tmpdir(), `${uniqueSuffix}-${req.file.originalname}`);
            fs.writeFileSync(tempXmlPath, req.file.buffer);
        }

        // 3. Handoff to the Python Flask microservice using the secure temp path
        const pythonResponse = await axios.post('http://localhost:8000/process-xml', {
            filePath: tempXmlPath
        });

        console.log('Python Service Processing Response received.');

        let cleanedData = pythonResponse.data;

        // 4. Validate Python Response Structure
        if (cleanedData.data && Array.isArray(cleanedData.data)) {
            cleanedData = cleanedData.data;
        }

        if (!Array.isArray(cleanedData)) {
            throw new Error(`Python service returned an unexpected object format instead of an array.`);
        }

        // 5. Map records using the token's authenticated userId
        const recordsToSave = cleanedData.map(record => ({
            userId: userId,
            type: record.type,
            value: parseFloat(record.value),
            unit: record.unit,
            startDate: new Date(record.startDate),
            endDate: new Date(record.endDate)
        }));

        // 6. Bulk Storage execution layer
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

        // Clean up the temporary system file immediately after successful write cycles
        if (tempXmlPath && fs.existsSync(tempXmlPath)) {
            fs.unlinkSync(tempXmlPath);
        }

        return res.status(200).json({
            message: 'Data successfully processed. New records added, duplicates skipped.',
            userId: userId,
            processedCount: recordsToSave.length
        });

    } catch (error) {
        // Fallback cleanup: ensures disk space doesn't leak if runtime failures occur mid-process
        if (tempXmlPath && fs.existsSync(tempXmlPath)) {
            try { fs.unlinkSync(tempXmlPath); } catch (e) { console.error('Cleanup error:', e); }
        }

        console.error('Hand-off Error:', error.message);
        return res.status(500).json({
            error: 'Failed to process and store health data',
            details: error.message
        });
    }
};
