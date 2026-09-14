import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/categories.routes.js';
import productRoutes from './routes/products.routes.js';
import reportRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import transactionRoutes from './routes/transactions.routes.js';
import userRoutes from './routes/users.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and non-browser clients send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  const api = express.Router();

  api.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', time: new Date().toISOString() });
    }
  });

  api.use('/auth', authRoutes);

  // Everything below requires a valid session; each router declares which roles may use it.
  api.use(authenticate);
  api.use('/settings', settingsRoutes);
  api.use('/categories', categoryRoutes);
  api.use('/products', productRoutes);
  api.use('/transactions', transactionRoutes);
  api.use('/reports', reportRoutes);
  api.use('/users', userRoutes);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
