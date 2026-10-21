import { beforeEach, describe, expect, it } from 'vitest';
import {
  bookedSlot,
  createPatient,
  get,
  join,
  pendingOffers,
  post,
  resetWorld,
  RUIZ,
} from '../lib/api.js';

type AuditEvent = { id: string; entityType: string; entityId: string; action: string; at: string };

async function audit(entityId: string): Promise<AuditEvent[]> {
  const res = await get(`/staff/audit?entityId=${entityId}`);
  expect(res.status).toBe(200);
  return res.body as AuditEvent[];
}

function expectWellFormed(events: AuditEvent[], entityId: string) {
  for (const e of events) {
    expect(e.entityId).toBe(entityId);
    expect(typeof e.id).toBe('string');
    expect(typeof e.entityType).toBe('string');
    expect(typeof e.action).toBe('string');
    expect(Number.isNaN(Date.parse(e.at))).toBe(false);
  }
}

// T8 is intentionally vague. Only the fixed contract is asserted here.
describe('T8 audit log (fixed contract)', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('records joining the waitlist against the entry', async () => {
    const p = await createPatient();
    const entry = await join({ patientId: p.id, providerId: RUIZ });
    const events = await audit(entry.id);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expectWellFormed(events, entry.id);
  });

  it('records offer creation and acceptance against the offer', async () => {
    const p = await createPatient();
    await join({ patientId: p.id, providerId: RUIZ });
    const { cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
    await cancel();
    const [offer] = await pendingOffers(p.id);
    expect(offer).toBeDefined();

    const afterCreate = await audit(offer!.id);
    expect(afterCreate.length).toBeGreaterThanOrEqual(1);
    expectWellFormed(afterCreate, offer!.id);

    expect((await post(`/offers/${offer!.id}/accept`)).status).toBe(200);
    const afterAccept = await audit(offer!.id);
    expect(afterAccept.length).toBeGreaterThan(afterCreate.length);
    expectWellFormed(afterAccept, offer!.id);
  });

  it('returns an empty list for an entity with no events', async () => {
    const p = await createPatient();
    await join({ patientId: p.id, providerId: RUIZ });
    expect(await audit('nothing_here')).toEqual([]);
  });
});
