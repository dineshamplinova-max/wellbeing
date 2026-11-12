import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import userRoutes from './routes/route.js';
import meditationRoutes from './routes/meditationRoutes.js';
import anonymousPostRoutes from './routes/anonymousPostRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import { getCorsOrigins } from './config/env.js';

mongoose.set('strictQuery', true);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Security headers set by hand (no extra dependency). API responses and uploaded
// files are never meant to run scripts or be framed.
const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  next();
};

// Client-facing errors never include stack traces or raw exception messages.
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError || err?.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ error: 'Upload rejected. Please use a JPEG, PNG, WebP or GIF image of 5 MB or less.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body could not be read.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' });
  }
  console.error('Unhandled request error:', err?.name);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
};

// Builds the Express app without listening or connecting to MongoDB, so the real
// routes can be exercised by offline tests.
export const createApp = () => {
  const app = express();
  const allowedOrigins = getCorsOrigins();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({
    // Only configured frontend origins receive CORS headers, so credentialed
    // responses are never shared with any other origin.
    origin: (origin, callback) => callback(null, Boolean(origin) && allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    credentials: true,
  }));
  // Browsers send Origin on cross-origin writes; reject writes from origins that
  // are not configured (CSRF defence alongside the SameSite session cookie).
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (UNSAFE_METHODS.has(req.method) && origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Requests from this origin are not allowed.' });
    }
    return next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  const staticOptions = { index: false, dotfiles: 'deny' };
  app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
  app.use('/upload1', express.static(path.join(__dirname, 'upload1'), staticOptions));
  app.use('/uploads/posts', express.static(path.join(__dirname, 'uploads', 'posts'), staticOptions));

  // Routes
  app.use('/', userRoutes);
  app.use('/api/meditation', meditationRoutes);
  app.use('/api/posts', anonymousPostRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/quiz', quizRoutes);

  app.use(errorHandler);
  return app;
};
