import { beforeEach, describe, expect, it } from 'vitest';
import {
  bookedSlot,
  createPatient,
  get,
  join,
  pendingOffers,
  resetWorld,
  RUIZ,
} from '../lib/api.js';

// T7 is intentionally vague. Only the fixed contract is asserted here.
describe('T7 notifications (fixed contract)', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('exposes sent notifications at GET /dev/notifications', async () => {
    const res = await get('/dev/notifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('notifies the offered patient when an offer is created', async () => {
    const waiting = await createPatient();
    await join({ patientId: waiting.id, providerId: RUIZ });
    const { cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
    await cancel();
    expect(await pendingOffers(waiting.id)).toHaveLength(1);

    const res = await get('/dev/notifications');
    expect(res.status).toBe(200);
    const mine = (res.body as Array<Record<string, unknown>>).filter(
      (n) => n.patientId === waiting.id,
    );
    expect(mine.length).toBeGreaterThanOrEqual(1);
    for (const n of mine) {
      expect(typeof n.type).toBe('string');
      expect(typeof n.body).toBe('string');
      expect(Number.isNaN(Date.parse(String(n.sentAt)))).toBe(false);
    }
  });
});
