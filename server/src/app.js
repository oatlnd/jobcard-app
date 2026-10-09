import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { HttpError } from './lib/util.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import customerRoutes from './routes/customers.js';
import bikeRoutes from './routes/bikes.js';
import partRoutes from './routes/parts.js';
import jobRoutes from './routes/jobs.js';
import invoiceRoutes from './routes/invoices.js';
import cashierRoutes from './routes/cashier.js';
import reportRoutes from './routes/reports.js';
import kitRoutes from './routes/kits.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import notificationRoutes from './routes/notifications.js';
import publicRoutes from './routes/public.js';
import masterRoutes from './routes/masters.js';
import attachmentRoutes, { filesRouter } from './routes/attachments.js';
import purchasingRoutes from './routes/purchasing.js';
import expenseRoutes from './routes/expenses.js';
import hrRoutes from './routes/hr.js';
import payrollRoutes from './routes/payroll.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Nginx
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, env: config.deployEnv, time: new Date().toISOString() }));

  // Public (no login)
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/files', filesRouter);
  app.use('/api/attachments', attachmentRoutes);

  // Staff only
  app.use('/api', requireAuth);
  app.use('/api/users', userRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/bikes', bikeRoutes);
  app.use('/api/parts', partRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/cashier', cashierRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/kits', kitRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/masters', masterRoutes);
  app.use('/api/purchasing', purchasingRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/hr', hrRoutes);
  app.use('/api/payroll', payrollRoutes);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  if (config.serveClient && fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'That record already exists', details: err.detail });
    }
    if (err?.code === '23503') {
      return res.status(409).json({ error: 'This record is linked to other records', details: err.detail });
    }
    if (err?.name === 'MulterError') {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
