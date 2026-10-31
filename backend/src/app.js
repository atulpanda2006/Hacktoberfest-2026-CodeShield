import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import env from './config/env.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './modules/auth/routes/authRoutes.js';
import userRoutes from './modules/users/routes/userRoutes.js';
import profileRoutes from './modules/profiles/routes/profileRoutes.js';
import repositoryRoutes from './modules/repositories/routes/repositoryRoutes.js';
import contributionRoutes from './modules/contributions/routes/contributionRoutes.js';
import verificationRoutes from './modules/verification/routes/verificationRoutes.js';
import aiRoutes from './modules/ai/routes/aiRoutes.js';
import reputationRoutes from './modules/reputation/routes/reputationRoutes.js';
import trustRoutes from './modules/trust/routes/trustRoutes.js';
import reviewRoutes from './modules/reviews/routes/reviewRoutes.js';
import vouchRoutes from './modules/vouch/routes/vouchRoutes.js';
import githubRoutes from './modules/github/routes/githubRoutes.js';
import disputeRoutes from './modules/disputes/routes/disputeRoutes.js';
import dashboardRoutes from './modules/dashboard/routes/dashboardRoutes.js';
import logger from './utils/logger.js';

const app = express();

// ============================================================
// Security Middleware
// ============================================================
app.use(helmet());
app.use(cors({
  origin: env.cors.origin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(globalLimiter);

// ============================================================
// Body Parsing Middleware
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// Request Logging
// ============================================================
if (!env.isTest()) {
  const morganStream = {
    write: (message) => logger.info(message.trim()),
  };
  app.use(morgan('combined', { stream: morganStream }));
}

// ============================================================
// API Routes
// ============================================================
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/repositories', repositoryRoutes);
app.use('/api/v1/contributions', contributionRoutes);
app.use('/api/v1/verification', verificationRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/reputation', reputationRoutes);
app.use('/api/v1/trust', trustRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/vouch', vouchRoutes);
app.use('/api/v1/github', githubRoutes);

// ============================================================
// Error Handling
// ============================================================
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
