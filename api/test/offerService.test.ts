import { beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../src/container.js';
import { addMinutes } from '../src/lib/time.js';
import { AppointmentService } from '../src/services/appointmentService.js';
import { createTestContext, expectAppError, NOW, type TestContext } from './helpers.js';
import type { Patient, Provider, Slot } from '../src/domain/types.js';
import { AppointmentRepository } from '../src/repositories/appointmentRepository.js';
import { SlotRepository } from '../src/repositories/slotRepository.js';
import { inTransaction } from '../src/db/database.js';

const WINDOW = { earliestAt: '2030-01-08T00:00:00.000Z', latestAt: '2030-01-20T23:59:59.999Z' };

describe('OfferService', () => {
  let ctx: TestContext;
  let provider: Provider;
  let slot: Slot;

  beforeEach(() => {
    ctx = createTestContext();
    provider = ctx.provider({ name: 'Dr. Ruiz' });
    slot = ctx.slot(provider.id, 7 * 24); // 2030-01-14 08:00
  });

  const { waitlist, offers } = {
    waitlist: () => ctx.services.waitlist,
    offers: () => ctx.services.offers,
  };
  const slotStatus = (id = slot.id) =>
    ctx.db.prepare('SELECT status FROM slots WHERE id = ?').pluck().get(id);
  const entryStatus = (id: string) =>
    ctx.db.prepare('SELECT status FROM waitlist_entries WHERE id = ?').pluck().get(id);

  const wait = (patient: Patient, overrides: Record<string, unknown> = {}) =>
    waitlist().join({ patientId: patient.id, providerId: provider.id, ...WINDOW, ...overrides });

  /** Book `slot` for a throwaway patient, then cancel it so the engine runs. */
  const freeSlot = (s = slot) => {
    const holder = ctx.patient();
    const appointment = ctx.services.appointments.book({ patientId: holder.id, slotId: s.id });
    return ctx.services.appointments.cancel(appointment.id);
  };

  describe('engine on cancellation', () => {
    it('offers the slot to the oldest eligible entry and holds it', () => {
      const first = ctx.patient();
      const second = ctx.patient();
      const entry = wait(first);
      ctx.clock.advanceMinutes(1);
      wait(second);
      freeSlot();

      const [offer] = offers().listPendingForPatient(first.id);
      expect(offer).toMatchObject({
        entryId: entry.id,
        slotId: slot.id,
        status: 'pending',
        expiresAt: addMinutes(ctx.clock.now(), 15).toISOString(),
        providerName: 'Dr. Ruiz',
      });
      expect(offers().listPendingForPatient(second.id)).toEqual([]);
      expect(entryStatus(entry.id)).toBe('offered');
      expect(slotStatus()).toBe('held');
      expectAppError(
        () => ctx.services.appointments.book({ patientId: second.id, slotId: slot.id }),
        409,
        'SLOT_UNAVAILABLE',
      );
      expect(ctx.services.notifier.list()).toEqual([
        expect.objectContaining({ patientId: first.id, type: 'offer_created' }),
      ]);
    });

    it('matches any-provider entries and window edges', () => {
      const p = ctx.patient();
      wait(p, {
        providerId: null,
        earliestAt: slot.startsAt,
        latestAt: '2030-01-15T00:00:00.000Z',
      });
      freeSlot();
      expect(offers().listPendingForPatient(p.id)).toHaveLength(1);
    });

    it('includes a slot at the latest edge', () => {
      const p = ctx.patient();
      wait(p, { earliestAt: '2030-01-08T00:00:00.000Z', latestAt: slot.startsAt });
      freeSlot();
      expect(offers().listPendingForPatient(p.id)).toHaveLength(1);
    });

    it('skips other providers and windows that exclude the slot, leaving the slot open', () => {
      const other = ctx.patient();
      wait(other, { providerId: ctx.provider().id });
      const late = ctx.patient();
      wait(late, { earliestAt: '2030-01-15T00:00:00.000Z' });
      freeSlot();
      expect(offers().listPendingForPatient(other.id)).toEqual([]);
      expect(offers().listPendingForPatient(late.id)).toEqual([]);
      expect(slotStatus()).toBe('open');
    });

    it('uses the configured TTL', () => {
      const services = createServices(ctx.db, ctx.clock, { offerTtlMinutes: 5 });
      const p = ctx.patient();
      wait(p);
      const holder = ctx.patient();
      const appt = services.appointments.book({ patientId: holder.id, slotId: slot.id });
      services.appointments.cancel(appt.id);
      expect(services.offers.listPendingForPatient(p.id)[0]?.expiresAt).toBe(
        addMinutes(NOW, 5).toISOString(),
      );
    });

    it('does not fail the cancellation when the engine throws', () => {
      const transact = <T>(fn: () => T) => inTransaction(ctx.db, fn);
      const service = new AppointmentService(
        new AppointmentRepository(ctx.db),
        new SlotRepository(ctx.db),
        ctx.services.patients,
        ctx.clock,
        transact,
        {
          slotReleased: () => {
            throw new Error('boom');
          },
        },
      );
      const holder = ctx.patient();
      const appt = service.book({ patientId: holder.id, slotId: slot.id });
      const original = console.error;
      console.error = () => {};
      try {
        expect(service.cancel(appt.id).status).toBe('cancelled');
      } finally {
        console.error = original;
      }
      expect(slotStatus()).toBe('open');
    });

    it('requires patientId when listing', () => {
      expectAppError(() => offers().listPendingForPatient(undefined), 400, 'VALIDATION_ERROR');
    });
  });

  describe('accept and decline', () => {
    let patient: Patient;
    let next: Patient;
    let entryId: string;
    let nextEntryId: string;
    let offerId: string;

    beforeEach(() => {
      patient = ctx.patient();
      next = ctx.patient();
      entryId = wait(patient).id;
      ctx.clock.advanceMinutes(1);
      nextEntryId = wait(next).id;
      freeSlot();
      offerId = offers().listPendingForPatient(patient.id)[0]!.id;
    });

    it('accept books the slot directly and marks entry and offer', () => {
      const appointment = offers().accept(offerId);
      expect(appointment).toMatchObject({
        patientId: patient.id,
        slotId: slot.id,
        status: 'booked',
      });
      expect(entryStatus(entryId)).toBe('booked');
      expect(slotStatus()).toBe('booked');
      expectAppError(() => offers().accept(offerId), 409, 'OFFER_NOT_PENDING');
      expect(ctx.services.audit.listForEntity(offerId).map((e) => e.action)).toEqual([
        'created',
        'accepted',
      ]);
    });

    it('accept ignores the booking lead time', () => {
      ctx.clock.set(addMinutes(new Date(slot.startsAt), -60));
      // Offer would have expired by now; make a fresh manual one on a soon slot instead.
      const soon = ctx.slot(provider.id, 0.5);
      const p = ctx.patient();
      const entry = wait(p, { earliestAt: '2030-01-08T00:00:00.000Z' });
      const offer = offers().createManual({ entryId: entry.id, slotId: soon.id });
      expect(offers().accept(offer.id).status).toBe('booked');
    });

    it('decline passes the slot on and never re-offers the same entry', () => {
      expect(offers().decline(offerId).status).toBe('declined');
      expect(entryStatus(entryId)).toBe('active');
      expect(offers().listPendingForPatient(next.id)[0]?.slotId).toBe(slot.id);
      const nextOffer = offers().listPendingForPatient(next.id)[0]!;
      offers().decline(nextOffer.id);
      expect(offers().listPendingForPatient(patient.id)).toEqual([]);
      expect(slotStatus()).toBe('open');
      expectAppError(() => offers().decline(offerId), 409, 'OFFER_NOT_PENDING');
    });

    it('leaving an offered entry declines its offer and passes the slot on', () => {
      waitlist().leave(entryId);
      expect(entryStatus(entryId)).toBe('removed');
      expect(offers().listPendingForPatient(next.id)).toHaveLength(1);
    });

    it('expires lazily and returns 410, persisting the cascade', () => {
      ctx.clock.advanceMinutes(15);
      expectAppError(() => offers().accept(offerId), 410, 'OFFER_EXPIRED');
      expectAppError(() => offers().decline(offerId), 410, 'OFFER_EXPIRED');
      expect(entryStatus(entryId)).toBe('active');
      expect(offers().listPendingForPatient(next.id)[0]).toMatchObject({
        slotId: slot.id,
        expiresAt: addMinutes(ctx.clock.now(), 15).toISOString(),
      });
      expect(entryStatus(nextEntryId)).toBe('offered');
    });

    it('expireDue counts expired offers and reopens the slot at the end', () => {
      expect(offers().expireDue()).toBe(0);
      ctx.clock.advanceMinutes(20);
      expect(offers().expireDue()).toBe(1);
      ctx.clock.advanceMinutes(20);
      expect(offers().expireDue()).toBe(1);
      expect(slotStatus()).toBe('open');
      expect(ctx.services.notifier.list().map((n) => n.type)).toContain('offer_expired');
    });

    it('reopens rather than re-offers a slot that has already started', () => {
      ctx.clock.set(addMinutes(new Date(slot.startsAt), 1));
      offers().expireDue();
      expect(slotStatus()).toBe('open');
    });

    it('404s for an unknown offer', () => {
      expectAppError(() => offers().accept('off_nope'), 404, 'NOT_FOUND');
    });
  });

  describe('createManual', () => {
    it('validates entry, slot and states', () => {
      const p = ctx.patient();
      const entry = wait(p);
      const other = ctx.slot(provider.id, 30);
      expectAppError(() => offers().createManual({ entryId: entry.id }), 400, 'VALIDATION_ERROR');
      expectAppError(
        () => offers().createManual({ entryId: 'wl_nope', slotId: slot.id }),
        404,
        'NOT_FOUND',
      );
      expectAppError(
        () => offers().createManual({ entryId: entry.id, slotId: 'slt_nope' }),
        404,
        'NOT_FOUND',
      );
      const offer = offers().createManual({ entryId: entry.id, slotId: other.id });
      expect(offer).toMatchObject({
        status: 'pending',
        expiresAt: addMinutes(NOW, 15).toISOString(),
      });
      expectAppError(
        () => offers().createManual({ entryId: entry.id, slotId: slot.id }),
        409,
        'ENTRY_HAS_PENDING_OFFER',
      );
      const q = ctx.patient();
      const entry2 = wait(q);
      expectAppError(
        () => offers().createManual({ entryId: entry2.id, slotId: other.id }),
        409,
        'SLOT_NOT_OPEN',
      );
      waitlist().leave(entry2.id);
      expectAppError(
        () => offers().createManual({ entryId: entry2.id, slotId: slot.id }),
        409,
        'ENTRY_NOT_ACTIVE',
      );
    });
  });

  describe('audit', () => {
    it('requires entityId', () => {
      expectAppError(() => ctx.services.audit.listForEntity(undefined), 400, 'VALIDATION_ERROR');
    });
  });
});
