import { Router } from 'express';
import type { Db } from '../db/database.js';
import { resetDatabase } from '../db/reset.js';
import { seedDemoData } from '../db/seed.js';
import type { ControllableClock } from '../lib/clock.js';
import { toIso } from '../lib/time.js';
import type { InMemoryNotifier } from '../services/notifier.js';
import { asInput, optionalInteger, optionalIsoTimestamp } from '../lib/validate.js';

/**
 * Test hooks, mounted at `/api/dev` only when ENABLE_DEV_ROUTES=1.
 * Used by e2e tests to get a known state, control time and inspect notifications.
 */
export function devRouter(db: Db, clock: ControllableClock, notifier: InMemoryNotifier): Router {
  const router = Router();

  router.post('/reset', (req, res) => {
    const input = asInput(req.body ?? {});
    resetDatabase(db);
    notifier.clear();
    if (input.seed === true) seedDemoData(db, clock);
    res.status(204).end();
  });

  router.get('/clock', (_req, res) => {
    res.json({ now: toIso(clock.now()), frozen: clock.isFrozen() });
  });

  // Body: { now: ISO | null } to freeze/unfreeze, or { advanceMinutes: n }.
  router.post('/clock', (req, res) => {
    const input = asInput(req.body);
    const advance = optionalInteger(input, 'advanceMinutes', { min: 0, max: 525_600 });
    if (advance !== null) {
      clock.advanceMinutes(advance);
    } else {
      clock.set(optionalIsoTimestamp(input, 'now'));
    }
    res.json({ now: toIso(clock.now()), frozen: clock.isFrozen() });
  });

  // Messages sent by the stub notifier.
  router.get('/notifications', (_req, res) => {
    res.json(notifier.list());
  });

  return router;
}
