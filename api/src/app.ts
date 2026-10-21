import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { createServices } from './container.js';
import type { Db } from './db/database.js';
import type { Clock, ControllableClock } from './lib/clock.js';
import { errorHandler, routeNotFound } from './middleware/errorHandler.js';
import { appointmentsRouter } from './routes/appointments.js';
import { devRouter } from './routes/dev.js';
import { offersRouter } from './routes/offers.js';
import { patientsRouter } from './routes/patients.js';
import { providersRouter } from './routes/providers.js';
import { staffRouter } from './routes/staff.js';
import { waitlistRouter } from './routes/waitlist.js';

export interface AppOptions {
  db: Db;
  clock: Clock;
  /** When set, `/api/dev/*` test hooks are mounted and control this clock. */
  devClock?: ControllableClock;
  /** Directory of the built web app to serve, if it exists. */
  webDistPath?: string;
  /** Waitlist offer TTL (defaults to 15 minutes). */
  offerTtlMinutes?: number;
}

export function createApp({
  db,
  clock,
  devClock,
  webDistPath,
  offerTtlMinutes,
}: AppOptions): Express {
  const services = createServices(db, clock, { offerTtlMinutes });
  const app = express();
  app.use(express.json());

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/patients', patientsRouter(services.patients));
  api.use('/providers', providersRouter(services.providers, services.slots));
  api.use('/appointments', appointmentsRouter(services.appointments));
  api.use('/waitlist', waitlistRouter(services.waitlist));
  api.use('/offers', offersRouter(services.offers));
  api.use(
    '/staff',
    staffRouter(services.slots, services.waitlist, services.offers, services.audit),
  );
  if (devClock) api.use('/dev', devRouter(db, devClock, services.notifier));
  api.use(routeNotFound);

  app.use('/api', api);

  if (webDistPath && fs.existsSync(path.join(webDistPath, 'index.html'))) {
    app.use(express.static(webDistPath));
    // Client-side routing: serve the SPA shell for any other GET.
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
