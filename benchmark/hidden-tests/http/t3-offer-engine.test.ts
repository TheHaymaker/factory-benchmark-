import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceMinutes,
  availableSlotIds,
  bookedSlot,
  createPatient,
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

const SLOT_AT = '2030-01-15T14:00:00.000Z';

describe('T3 offer engine', () => {
  beforeEach(async () => {
    await resetWorld();
  });

  it('offers a cancelled slot to an eligible waiting patient', async () => {
    const waiting = await createPatient();
    const entry = await join({ patientId: waiting.id, providerId: RUIZ });
    const { slot, cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await cancel();

    const offers = await pendingOffers(waiting.id);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ entryId: entry.id, slotId: slot.id, status: 'pending' });
    expect(await entryStatus(waiting.id, entry.id)).toBe('offered');
  });

  it('sets expiresAt to now + 15 minutes by default', async () => {
    const waiting = await createPatient();
    await join({ patientId: waiting.id, providerId: RUIZ });
    const { cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await advanceMinutes(30);
    await cancel();
    const [offer] = await pendingOffers(waiting.id);
    expect(offer?.expiresAt).toBe('2030-01-07T08:45:00.000Z');
  });

  it('leaves the cancellation response unchanged', async () => {
    const waiting = await createPatient();
    await join({ patientId: waiting.id, providerId: RUIZ });
    const { appointment } = await bookedSlot(RUIZ, SLOT_AT);
    const res = await post(`/appointments/${appointment.id}/cancel`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: appointment.id, status: 'cancelled' });
  });

  it('holds the slot while an offer is pending', async () => {
    const waiting = await createPatient();
    await join({ patientId: waiting.id, providerId: RUIZ });
    const { slot, cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await cancel();

    expect(await availableSlotIds(RUIZ)).not.toContain(slot.id);
    const intruder = await createPatient();
    const res = await post('/appointments', { patientId: intruder.id, slotId: slot.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('SLOT_UNAVAILABLE');
  });

  it('matches any-provider entries', async () => {
    const waiting = await createPatient();
    await join({ patientId: waiting.id, providerId: null });
    const { slot, cancel } = await bookedSlot(OKAFOR, SLOT_AT);
    await cancel();
    expect((await pendingOffers(waiting.id)).map((o) => o.slotId)).toEqual([slot.id]);
  });

  it('skips entries for a different provider or whose window excludes the slot', async () => {
    const otherProvider = await createPatient();
    await join({ patientId: otherProvider.id, providerId: OKAFOR });
    const wrongWindow = await createPatient();
    await join({
      patientId: wrongWindow.id,
      providerId: RUIZ,
      earliestAt: '2030-01-16T00:00:00.000Z',
      latestAt: '2030-01-18T00:00:00.000Z',
    });
    const eligible = await createPatient();
    const entry = await join({ patientId: eligible.id, providerId: RUIZ });

    const { cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await cancel();

    expect(await pendingOffers(otherProvider.id)).toEqual([]);
    expect(await pendingOffers(wrongWindow.id)).toEqual([]);
    expect((await pendingOffers(eligible.id)).map((o) => o.entryId)).toEqual([entry.id]);
  });

  it('includes a slot that starts exactly at the window bounds', async () => {
    const atStart = await createPatient();
    await join({
      patientId: atStart.id,
      providerId: RUIZ,
      earliestAt: SLOT_AT,
      latestAt: '2030-01-16T00:00:00.000Z',
    });
    const { slot, cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await cancel();
    expect((await pendingOffers(atStart.id)).map((o) => o.slotId)).toEqual([slot.id]);
  });

  it('offers to the entry that joined first', async () => {
    const first = await createPatient();
    const second = await createPatient();
    await join({ patientId: first.id, providerId: RUIZ });
    await advanceMinutes(10);
    await join({ patientId: second.id, providerId: RUIZ });

    const { cancel } = await bookedSlot(RUIZ, SLOT_AT);
    await cancel();
    expect(await pendingOffers(first.id)).toHaveLength(1);
    expect(await pendingOffers(second.id)).toEqual([]);
  });

  it('leaves the slot open when nobody is eligible', async () => {
    const { slot, cancel } = await bookedSlot(RUIZ, SLOT_AT);
    // Make sure the waitlist feature exists: an unrelated entry for another provider.
    const unrelated = await createPatient();
    await join({ patientId: unrelated.id, providerId: OKAFOR });
    await cancel();
    expect(await availableSlotIds(RUIZ)).toContain(slot.id);
    expect(await pendingOffers(unrelated.id)).toEqual([]);
  });

  it('requires patientId when listing offers', async () => {
    const res = await get('/offers');
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });
});
