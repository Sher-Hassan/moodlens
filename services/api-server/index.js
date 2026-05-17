import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/corsConfig.js';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import xmlRoutes from './routes/xmlRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import uploadTokenRoutes from './routes/uploadTokenRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import aiSummaryRoutes from './routes/aiSummaryRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';

dotenv.config();

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
connectDB();

// ========================================
// Request Logging Middleware
// ========================================
app.use((req, res, next) => {
    console.log(`\n📨 [REQUEST] ${req.method} ${req.url}`);
    console.log(`📨 [REQUEST] Origin: ${req.headers.origin || 'none'}`);
    console.log(`📨 [REQUEST] IP: ${req.ip}`);
    next();
});

// ========================================
// CORS Configuration
// ========================================
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const allowedOrigins = [
    'http://localhost:5173',
    'http://192.168.100.92:5173',
    'http://172.24.16.1:5173',
    ...envOrigins,
];

// Also allow any *.vercel.app preview URL (so future Vercel previews don't break)
const vercelPreviewRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
    },
    credentials: true,
}));

console.log('🌐 CORS enabled for:');
allowedOrigins.forEach(o => console.log(`   - ${o}`));
console.log(`   - (any *.vercel.app subdomain via regex)`);

// ========================================
// Middleware
// ========================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========================================
// Routes
// ========================================
app.use('/api/users', userRoutes);
app.use('/api/health', xmlRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/upload-token', uploadTokenRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai/summary', aiSummaryRoutes);
app.use('/api/chat', chatbotRoutes);

// Health check endpoint
app.get('/api/health/status', (req, res) => {
    console.log('✅ [HEALTH CHECK] Endpoint hit');
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// ========================================
// Error Handling
// ========================================
app.use((err, req, res, next) => {
    console.error('❌ [ERROR]', err.message);
    console.error('❌ [ERROR] Stack:', err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: err.message 
    });
});

// ========================================
// Start Server
// ========================================
const PORT = process.env.PORT || 3000;

// CRITICAL: Listen on 0.0.0.0 to accept connections from network
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ MoodLens API Server Started');
    console.log('='.repeat(60));
    console.log(`\n📡 Server URLs:`);
    console.log(`   - Local:   http://localhost:${PORT}`);
    console.log(`   - Network: http://192.168.100.92:${PORT}`);
    console.log(`\n🌐 CORS enabled for:`);
    allowedOrigins.forEach(origin => {
        console.log(`   - ${origin}`);
    });
    console.log('\n' + '='.repeat(60) + '\n');
});

export default app;
