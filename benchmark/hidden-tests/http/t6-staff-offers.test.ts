import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceMinutes,
  bookedSlot,
  createPatient,
  createSlot,
  del,
  entryStatus,
  errorCode,
  get,
  join,
  OKAFOR,
  pendingOffers,
  post,
  resetWorld,
  RUIZ,
} from '../lib/api.js';

describe('T6 staff waitlist API and manual offers', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('lists non-removed entries oldest first with patient and provider names', async () => {
    const a = await createPatient('Avery Staffview');
    const b = await createPatient('Blake Staffview');
    const first = await join({ patientId: a.id, providerId: RUIZ });
    await advanceMinutes(3);
    const second = await join({ patientId: b.id, providerId: null });
    await advanceMinutes(3);
    const removed = await join({ patientId: b.id, providerId: OKAFOR });
    await del(`/waitlist/${removed.id}`);

    const res = await get('/staff/waitlist');
    expect(res.status).toBe(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([first.id, second.id]);
    expect(res.body[0]).toMatchObject({
      patientName: 'Avery Staffview',
      providerName: 'Dr. Ana Ruiz',
    });
    expect(res.body[1]).toMatchObject({ patientName: 'Blake Staffview', providerName: null });

    const filtered = await get(`/staff/waitlist?providerId=${RUIZ}`);
    expect(filtered.body.map((e: { id: string }) => e.id)).toEqual([first.id]);
  });

  it('creates a manual offer that bypasses ordering', async () => {
    const first = await createPatient();
    const second = await createPatient();
    await join({ patientId: first.id, providerId: RUIZ });
    await advanceMinutes(5);
    const secondEntry = await join({ patientId: second.id, providerId: RUIZ });
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');

    const res = await post('/staff/offers', { entryId: secondEntry.id, slotId: slot.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      entryId: secondEntry.id,
      slotId: slot.id,
      status: 'pending',
      expiresAt: '2030-01-07T08:20:00.000Z',
    });
    expect(await entryStatus(second.id, secondEntry.id)).toBe('offered');
    expect(await pendingOffers(first.id)).toEqual([]);

    // A manual offer behaves like any other: it can be accepted.
    expect((await post(`/offers/${res.body.id}/accept`)).status).toBe(200);
  });

  it('rejects a slot that is not open with 409 SLOT_NOT_OPEN', async () => {
    const p = await createPatient();
    const entry = await join({ patientId: p.id, providerId: RUIZ });
    const { slot } = await bookedSlot(RUIZ, '2030-01-15T16:00:00.000Z');
    const res = await post('/staff/offers', { entryId: entry.id, slotId: slot.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('SLOT_NOT_OPEN');
  });

  it('treats a slot held by a pending offer as not open', async () => {
    const a = await createPatient();
    const b = await createPatient();
    const entryA = await join({ patientId: a.id, providerId: RUIZ });
    const entryB = await join({ patientId: b.id, providerId: OKAFOR });
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    expect((await post('/staff/offers', { entryId: entryA.id, slotId: slot.id })).status).toBe(201);
    const res = await post('/staff/offers', { entryId: entryB.id, slotId: slot.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('SLOT_NOT_OPEN');
  });

  it('rejects an entry that already has a pending offer with 409 ENTRY_HAS_PENDING_OFFER', async () => {
    const p = await createPatient();
    const entry = await join({ patientId: p.id, providerId: RUIZ });
    const s1 = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    const s2 = await createSlot(RUIZ, '2030-01-15T16:00:00.000Z');
    expect((await post('/staff/offers', { entryId: entry.id, slotId: s1.id })).status).toBe(201);
    const res = await post('/staff/offers', { entryId: entry.id, slotId: s2.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ENTRY_HAS_PENDING_OFFER');
  });

  it('rejects a removed entry with 409 ENTRY_NOT_ACTIVE', async () => {
    const p = await createPatient();
    const entry = await join({ patientId: p.id, providerId: RUIZ });
    await del(`/waitlist/${entry.id}`);
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    const res = await post('/staff/offers', { entryId: entry.id, slotId: slot.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ENTRY_NOT_ACTIVE');
  });

  it('returns 404 NOT_FOUND for an unknown entry or slot', async () => {
    const p = await createPatient();
    const entry = await join({ patientId: p.id, providerId: RUIZ });
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    const badEntry = await post('/staff/offers', { entryId: 'wl_nope', slotId: slot.id });
    expect(badEntry.status).toBe(404);
    expect(errorCode(badEntry)).toBe('NOT_FOUND');
    const badSlot = await post('/staff/offers', { entryId: entry.id, slotId: 'slt_nope' });
    expect(badSlot.status).toBe(404);
    expect(errorCode(badSlot)).toBe('NOT_FOUND');
  });
});
