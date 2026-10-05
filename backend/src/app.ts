// ============================================================
// Smart Library Management System - Express Application Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { apiLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';
import { archiveRetentionService, notificationService } from './services';
import { UPLOADS_ROOT } from './middlewares/upload';

const app = express();
const configuredOrigins = (Array.isArray(env.FRONTEND_URL)
  ? env.FRONTEND_URL
  : [env.FRONTEND_URL]).map((origin) => origin.replace(/\/+$/, ''));
const allowedOrigins = new Set([
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'https://localhost:3000',
  'https://localhost:4000',
  'https://127.0.0.1:3000',
  'https://127.0.0.1:4000',
]);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/+$/, '');
  if (allowedOrigins.has(normalizedOrigin)) return true;

  try {
    const { hostname, protocol } = new URL(normalizedOrigin);
    const trustedHostSuffixes = ['.vercel.app', '.netlify.app', '.railway.app', '.fly.dev'];
    const isKnownPreviewHost = trustedHostSuffixes.some((suffix) => hostname.endsWith(suffix));
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);

    if (isKnownPreviewHost || (isLocalHost && ['http:', 'https:'].includes(protocol))) {
      return true;
    }
  } catch {
    // Ignore malformed origins and reject them below.
  }

  return false;
};

// ============================================================
// Security Middleware
// ============================================================
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));

// ============================================================
// Body Parsing
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// ============================================================
// Uploaded Files (e-book files, cover images)
// ============================================================
// helmet()'s default Cross-Origin-Resource-Policy is 'same-origin', which
// would block the frontend (a different origin/port) from loading these
// files via <img>/fetch/PDF.js. Explicitly relax it for this route only.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(UPLOADS_ROOT)
);

// ============================================================
// Rate Limiting (global)
// ============================================================
app.use('/api', apiLimiter);

// ============================================================
// API Routes
// ============================================================
app.use('/api', routes);

// ============================================================
// 404 Handler
// ============================================================
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// ============================================================
// Global Error Handler (must be last)
// ============================================================
app.use(errorHandler);

// ============================================================
// Start Server (with graceful port fallback on EADDRINUSE)
// ============================================================
function startServer(port: number, maxRetries = 3): void {
  const server = app.listen(port);

  server.on('listening', () => {
    const actualPort = (server.address() as any).port;
    console.log(`🚀  Library API server running on http://localhost:${actualPort}`);
    console.log(`📚  Environment: ${env.NODE_ENV}`);
    console.log(`🔗  Frontend URL: ${env.FRONTEND_URL}`);

    if (env.NODE_ENV === 'development') {
      console.log('');
      console.log('   Available routes:');
      console.log('   POST   /api/auth/login');
      console.log('   POST   /api/auth/register');
      console.log('   GET    /api/auth/me');
      console.log('   GET    /api/books');
      console.log('   GET    /api/books/:id');
      console.log('   POST   /api/books               (LIBRARIAN)');
      console.log('   PUT    /api/books/:id            (LIBRARIAN)');
      console.log('   DELETE /api/books/:id            (LIBRARIAN)');
      console.log('   GET    /api/ebooks');
      console.log('   GET    /api/ebooks/:id');
      console.log('   POST   /api/ebooks               (LIBRARIAN)');
      console.log('   PUT    /api/ebooks/:id            (LIBRARIAN)');
      console.log('   DELETE /api/ebooks/:id            (LIBRARIAN)');
      console.log('   GET    /api/categories');
      console.log('   GET    /api/categories/:id');
      console.log('   POST   /api/categories            (LIBRARIAN)');
      console.log('   PUT    /api/categories/:id         (LIBRARIAN)');
      console.log('   DELETE /api/categories/:id         (LIBRARIAN)');
      console.log('   POST   /api/transactions/requests');
      console.log('   GET    /api/transactions/requests');
      console.log('   PUT    /api/transactions/requests/:id/approve');
      console.log('   PUT    /api/transactions/requests/:id/reject');
      console.log('   GET    /api/transactions');
      console.log('   GET    /api/transactions/:id');
      console.log('   PUT    /api/transactions/:id/return          (QR or ID)');
      console.log('   PUT    /api/transactions/:id/pay-fine');
      console.log('   POST   /api/transactions/check-overdue');
      console.log('   GET    /api/transactions/my-count');
      console.log('   POST   /api/reservations');
      console.log('   GET    /api/reservations');
      console.log('   PUT    /api/reservations/:id/cancel');
      console.log('   GET    /api/policies                       (LIBRARIAN)');
      console.log('   GET    /api/policies/:key                  (LIBRARIAN)');
      console.log('   PUT    /api/policies                       (LIBRARIAN)');
      console.log('   DELETE /api/policies/:key                  (LIBRARIAN)');
      console.log('');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${port} is already in use.`);
      if (maxRetries > 0) {
        const nextPort = port + 1;
        console.log(`🔁  Retrying with port ${nextPort}...`);
        startServer(nextPort, maxRetries - 1);
      } else {
        console.error('❌  Could not find an available port after multiple attempts.');
        process.exit(1);
      }
    } else {
      console.error('❌  Server error:', err.message);
      process.exit(1);
    }
  });
}

startServer(env.PORT);

const ARCHIVE_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DUE_REMINDER_INTERVAL_MS = 60 * 60 * 1000;

void archiveRetentionService.purgeExpiredArchives().catch((error) => {
  console.error('Archive retention check failed at startup:', error);
});

void notificationService.sendDueDateReminders().catch((error) => {
  console.error('Due-date reminder check failed at startup:', error);
});

setInterval(() => {
  void archiveRetentionService.purgeExpiredArchives().catch((error) => {
    console.error('Scheduled archive retention check failed:', error);
  });
}, ARCHIVE_RETENTION_INTERVAL_MS);

setInterval(() => {
  void notificationService.sendDueDateReminders().catch((error) => {
    console.error('Scheduled due-date reminder check failed:', error);
  });
}, DUE_REMINDER_INTERVAL_MS);

export default app;

