import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceMinutes,
  availableSlotIds,
  bookedSlot,
  createPatient,
  del,
  entryStatus,
  errorCode,
  get,
  join,
  pendingOffers,
  post,
  resetWorld,
  RUIZ,
} from '../lib/api.js';

const SLOT_AT = '2030-01-15T14:00:00.000Z';

/** One patient waiting for Dr. Ruiz, then a Ruiz slot cancelled so they get an offer. */
async function offered(extraWaiting = 0) {
  const patient = await createPatient();
  const entry = await join({ patientId: patient.id, providerId: RUIZ });
  const others = [];
  for (let i = 0; i < extraWaiting; i++) {
    await advanceMinutes(1);
    const p = await createPatient();
    others.push({ patient: p, entry: await join({ patientId: p.id, providerId: RUIZ }) });
  }
  const { slot, cancel } = await bookedSlot(RUIZ, SLOT_AT);
  await cancel();
  const [offer] = await pendingOffers(patient.id);
  if (!offer) throw new Error('expected an offer (T3)');
  return { patient, entry, slot, offer, others };
}

describe('T4 accept and decline offers', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('accept books the slot and marks entry booked and offer accepted', async () => {
    const { patient, entry, slot, offer } = await offered();
    const res = await post(`/offers/${offer.id}/accept`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ patientId: patient.id, slotId: slot.id, status: 'booked' });

    const appts = (await get(`/appointments?patientId=${patient.id}`)).body;
    expect(appts.map((a: { id: string }) => a.id)).toEqual([res.body.id]);
    expect(await entryStatus(patient.id, entry.id)).toBe('booked');
    expect(await pendingOffers(patient.id)).toEqual([]);
  });

  it('rejects a second accept with 409 OFFER_NOT_PENDING', async () => {
    const { offer } = await offered();
    expect((await post(`/offers/${offer.id}/accept`)).status).toBe(200);
    const again = await post(`/offers/${offer.id}/accept`);
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('OFFER_NOT_PENDING');
  });

  it('creates exactly one appointment under concurrent accepts', async () => {
    const { patient, slot, offer } = await offered();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(`/offers/${offer.id}/accept`)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    const forSlot = (await get(`/appointments?patientId=${patient.id}`)).body.filter(
      (a: { slotId: string; status: string }) => a.slotId === slot.id && a.status === 'booked',
    );
    expect(forSlot).toHaveLength(1);
  });

  it('decline returns the entry to active and offers the slot to the next entry', async () => {
    const { patient, entry, slot, offer, others } = await offered(1);
    const res = await post(`/offers/${offer.id}/decline`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: offer.id, status: 'declined' });

    expect(await entryStatus(patient.id, entry.id)).toBe('active');
    expect(await pendingOffers(patient.id)).toEqual([]);
    const next = others[0]!;
    expect((await pendingOffers(next.patient.id)).map((o) => o.slotId)).toEqual([slot.id]);
    expect(await entryStatus(next.patient.id, next.entry.id)).toBe('offered');
  });

  it('reopens the slot when nobody else is eligible after a decline', async () => {
    const { patient, slot, offer } = await offered();
    expect((await post(`/offers/${offer.id}/decline`)).status).toBe(200);
    expect(await pendingOffers(patient.id)).toEqual([]);
    expect(await availableSlotIds(RUIZ)).toContain(slot.id);
  });

  it('rejects acting on a declined offer with 409 OFFER_NOT_PENDING', async () => {
    const { offer } = await offered();
    await post(`/offers/${offer.id}/decline`);
    const res = await post(`/offers/${offer.id}/accept`);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('OFFER_NOT_PENDING');
  });

  it('rejects accepting an expired offer with 410 OFFER_EXPIRED', async () => {
    const { offer } = await offered();
    await advanceMinutes(16);
    const res = await post(`/offers/${offer.id}/accept`);
    expect(res.status).toBe(410);
    expect(errorCode(res)).toBe('OFFER_EXPIRED');
  });

  it('still accepts just before expiry', async () => {
    const { offer } = await offered();
    await advanceMinutes(14);
    expect((await post(`/offers/${offer.id}/accept`)).status).toBe(200);
  });

  it('expire-due expires offers and cascades to the next entry', async () => {
    const { patient, entry, slot, others } = await offered(1);
    await advanceMinutes(20);
    const res = await post('/staff/offers/expire-due');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expiredCount: 1 });

    expect(await entryStatus(patient.id, entry.id)).toBe('active');
    const [next] = await pendingOffers(others[0]!.patient.id);
    expect(next).toMatchObject({ slotId: slot.id, status: 'pending' });
    // New offer gets a fresh TTL from the moment of expiry processing.
    expect(next!.expiresAt).toBe(
      new Date(Date.parse('2030-01-07T08:00:00.000Z') + (1 + 20 + 15) * 60_000).toISOString(),
    );
  });

  it('expire-due returns 0 when nothing is due', async () => {
    await offered();
    const res = await post('/staff/offers/expire-due');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expiredCount: 0 });
  });

  it('evaluates expiry lazily on read', async () => {
    const { patient } = await offered();
    await advanceMinutes(16);
    expect(await pendingOffers(patient.id)).toEqual([]);
  });

  it('deleting an offered entry declines the offer and passes the slot on', async () => {
    const { entry, slot, others } = await offered(1);
    expect((await del(`/waitlist/${entry.id}`)).status).toBe(204);
    expect((await pendingOffers(others[0]!.patient.id)).map((o) => o.slotId)).toEqual([slot.id]);
  });

  it('cannot delete a booked entry (409 ENTRY_BOOKED)', async () => {
    const { entry, offer } = await offered();
    await post(`/offers/${offer.id}/accept`);
    const res = await del(`/waitlist/${entry.id}`);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ENTRY_BOOKED');
  });

  it('returns 404 NOT_FOUND for an unknown offer', async () => {
    await offered();
    const res = await post('/offers/off_does_not_exist/accept');
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
  });
});
