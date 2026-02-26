import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import compression from 'compression';

// Middleware Imports
import securityMiddleware from './middleware/security.js';
import loggerMiddleware from './middleware/logger.js';
import { globalLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/AppError.js';

import { setupSocketHandlers } from './socket/handlers.js';

// Import routes
import clinicsRouter from './routes/clinics.js';
import patientsRouter from './routes/patients.js';
import vitalsRouter from './routes/vitals.js';
import evacuationsRouter from './routes/evacuations.js';
import dashboardRouter from './routes/dashboard.js';
import hospitalsRouter from './routes/hospitals.js';
import criticalRouter from './routes/critical.js';
import transportRouter from './routes/transport.js';
import bookingsRouter from './routes/bookings.js';
import locationRouter from './routes/location.js';

const app = express();
const httpServer = createServer(app);

// Socket.io setup with CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178',
        'https://island-clinical-portal-v2.vercel.app',
        'https://island-hospital-portal-v2.vercel.app',
        'https://island-admin-portal-v2.vercel.app',
        'https://island-transport-provider-portal-v2.vercel.app',
        'https://island-driver-portal-v2.vercel.app'
    ];

const corsOriginHelper = (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check allowed list
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);

    // Allow Visual Studio Code Dev Tunnels
    if (origin.endsWith('.devtunnels.ms')) return callback(null, true);

    // Block others
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
};

const io = new Server(httpServer, {
    cors: {
        origin: corsOriginHelper,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true
    }
});

// Setup socket handlers
setupSocketHandlers(io);

// ==========================================
// 🛡️ Middleware Pipeline
// ==========================================

// 1. Security Headers (Helmet)
app.use(securityMiddleware);

// 2. CORS (Cross-Origin Resource Sharing)
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// 3. Logger (Morgan)
if (process.env.NODE_ENV === 'development') {
    app.use(loggerMiddleware);
}

// 4. Rate Limiting (DoS Protection)
app.use('/api', apiLimiter); // Limit API requests
app.use('/', globalLimiter); // Global limit for other routes

// 5. Compression (Gzip)
app.use(compression());

// 6. Body Parsing
app.use(express.json({ limit: '10kb' })); // Limit body size

// 7. Socket Injection
app.use((req, res, next) => {
    req.io = io;
    next();
});

// ==========================================
// 🛣️ Routes
// ==========================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/clinics', clinicsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/vitals', vitalsRouter);
app.use('/api/evacuations', evacuationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/hospitals', hospitalsRouter);
app.use('/api/critical', criticalRouter);
app.use('/api/transport', transportRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/location', locationRouter);
import bedsRouter from './routes/beds.js';
app.use('/api/beds', bedsRouter);

// ==========================================
// ⚠️ Error Handling
// ==========================================

// 404 Handler (Catch-all for undefined routes)
app.all(/(.*)/, (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(errorHandler);

// ==========================================
// 🚀 Server Start
// ==========================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🏥 Island Medical Backend Server (Optimized)           ║
╠══════════════════════════════════════════════════════════╣
║   REST API:   http://localhost:${PORT}/api                  ║
║   WebSocket:  http://localhost:${PORT}                      ║
║   Health:     http://localhost:${PORT}/health               ║
╚══════════════════════════════════════════════════════════╝
    `);
});
