import express from 'express';
import multer from 'multer';
import path from 'path';
import { protectUpload } from '../middleware/auth.js';
import { handleUpload } from '../controllers/uploadController.js';
import { getDataStatus, getDailyData } from '../controllers/healthController.js';

const router = express.Router();

// Switch to memory storage - no more hardcoded local directory paths
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = ['.xml', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .xml and .zip files are allowed'), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB maximum
});

router.get('/status', protectUpload, getDataStatus);
router.get('/daily', protectUpload, getDailyData);
router.post('/upload', protectUpload, upload.single('file'), handleUpload);

export default router;
