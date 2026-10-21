import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceMinutes,
  bookedSlot,
  createPatient,
  entryStatus,
  get,
  join,
  pendingOffers,
  post,
  resetWorld,
  RUIZ,
} from '../lib/api.js';

// End-to-end flows across T2–T8, at the HTTP level.
describe('X cross-ticket flows', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('join → cancel → offer → decline → next offered → accept → booked, audited', async () => {
    const alice = await createPatient('Alice Flow');
    const bob = await createPatient('Bob Flow');
    const aliceEntry = await join({ patientId: alice.id, providerId: RUIZ });
    await advanceMinutes(2);
    const bobEntry = await join({ patientId: bob.id, providerId: null });

    const { slot, cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
    await cancel();

    const [aliceOffer] = await pendingOffers(alice.id);
    expect(aliceOffer?.slotId).toBe(slot.id);
    expect(await pendingOffers(bob.id)).toEqual([]);

    expect((await post(`/offers/${aliceOffer!.id}/decline`)).status).toBe(200);
    const [bobOffer] = await pendingOffers(bob.id);
    expect(bobOffer?.slotId).toBe(slot.id);

    const accepted = await post(`/offers/${bobOffer!.id}/accept`);
    expect(accepted.status).toBe(200);
    const bobAppointments = (await get(`/appointments?patientId=${bob.id}`)).body;
    expect(bobAppointments).toEqual([
      expect.objectContaining({ id: accepted.body.id, slotId: slot.id, status: 'booked' }),
    ]);
    expect(await entryStatus(bob.id, bobEntry.id)).toBe('booked');
    expect(await entryStatus(alice.id, aliceEntry.id)).toBe('active');

    for (const id of [aliceEntry.id, bobEntry.id, aliceOffer!.id, bobOffer!.id]) {
      const events = (await get(`/staff/audit?entityId=${id}`)).body;
      expect(events.length, `audit events for ${id}`).toBeGreaterThanOrEqual(1);
    }
    const notified = (await get('/dev/notifications')).body.map(
      (n: { patientId: string }) => n.patientId,
    );
    expect(notified).toEqual(expect.arrayContaining([alice.id, bob.id]));
  });

  it('expiry flow: offers expire on the Clock and cascade until someone accepts', async () => {
    const patients = [];
    for (let i = 0; i < 3; i++) {
      const p = await createPatient();
      patients.push({ p, entry: await join({ patientId: p.id, providerId: RUIZ }) });
      await advanceMinutes(1);
    }
    const { slot, cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
    await cancel();
    expect((await pendingOffers(patients[0]!.p.id)).map((o) => o.slotId)).toEqual([slot.id]);

    // First offer lapses; lazy read and the explicit hook must agree.
    await advanceMinutes(16);
    expect((await post('/staff/offers/expire-due')).status).toBe(200);
    expect(await pendingOffers(patients[0]!.p.id)).toEqual([]);
    const [second] = await pendingOffers(patients[1]!.p.id);
    expect(second?.slotId).toBe(slot.id);

    // Second offer also lapses, read lazily without the hook.
    await advanceMinutes(16);
    const expired = await post(`/offers/${second!.id}/accept`);
    expect(expired.status).toBe(410);
    const [third] = await pendingOffers(patients[2]!.p.id);
    expect(third?.slotId).toBe(slot.id);

    expect((await post(`/offers/${third!.id}/accept`)).status).toBe(200);
    expect(await entryStatus(patients[2]!.p.id, patients[2]!.entry.id)).toBe('booked');
    expect(await entryStatus(patients[0]!.p.id, patients[0]!.entry.id)).toBe('active');
  });
});
