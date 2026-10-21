import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, expectAppError, NOW, type TestContext } from './helpers.js';
import type { Patient, Provider, Slot } from '../src/domain/types.js';

describe('AppointmentService', () => {
  let ctx: TestContext;
  let provider: Provider;
  let patient: Patient;
  let slot: Slot;

  beforeEach(() => {
    ctx = createTestContext();
    provider = ctx.provider({ name: 'Dr. Ruiz' });
    patient = ctx.patient({ name: 'Jordan' });
    slot = ctx.slot(provider.id, 24);
  });

  const slotStatus = (id: string) =>
    ctx.db.prepare('SELECT status FROM slots WHERE id = ?').pluck().get(id);

  describe('book', () => {
    it('books an open slot and marks it booked', () => {
      const appointment = ctx.services.appointments.book({
        patientId: patient.id,
        slotId: slot.id,
        reason: 'Checkup',
      });
      expect(appointment).toMatchObject({
        slotId: slot.id,
        patientId: patient.id,
        status: 'booked',
        reason: 'Checkup',
        createdAt: NOW.toISOString(),
        cancelledAt: null,
        providerId: provider.id,
        providerName: 'Dr. Ruiz',
        patientName: 'Jordan',
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      expect(appointment.id).toMatch(/^apt_/);
      expect(slotStatus(slot.id)).toBe('booked');
    });

    it('rejects a slot that is already booked', () => {
      ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      const other = ctx.patient();
      expectAppError(
        () => ctx.services.appointments.book({ patientId: other.id, slotId: slot.id }),
        409,
        'SLOT_UNAVAILABLE',
      );
    });

    it('rejects slots outside the booking window and leaves them open', () => {
      const soon = ctx.slot(provider.id, 1);
      expectAppError(
        () => ctx.services.appointments.book({ patientId: patient.id, slotId: soon.id }),
        422,
        'OUTSIDE_BOOKING_WINDOW',
      );
      expect(slotStatus(soon.id)).toBe('open');
    });

    it('requires an existing patient and slot', () => {
      expectAppError(
        () => ctx.services.appointments.book({ patientId: 'pat_missing', slotId: slot.id }),
        404,
        'NOT_FOUND',
      );
      expectAppError(
        () => ctx.services.appointments.book({ patientId: patient.id, slotId: 'slt_missing' }),
        404,
        'NOT_FOUND',
      );
    });

    it('validates required fields', () => {
      expectAppError(
        () => ctx.services.appointments.book({ slotId: slot.id }),
        400,
        'VALIDATION_ERROR',
      );
    });
  });

  describe('cancel', () => {
    it('cancels a booking, records the reason and reopens the slot', () => {
      const booked = ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      ctx.clock.advanceMinutes(10);
      const cancelled = ctx.services.appointments.cancel(booked.id, { reason: 'Feeling better' });
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelledAt: '2030-01-07T08:10:00.000Z',
        cancellationReason: 'Feeling better',
      });
      expect(slotStatus(slot.id)).toBe('open');
    });

    it('lets someone else book the reopened slot', () => {
      const booked = ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      ctx.services.appointments.cancel(booked.id);
      const rebooked = ctx.services.appointments.book({
        patientId: ctx.patient().id,
        slotId: slot.id,
      });
      expect(rebooked.status).toBe('booked');
    });

    it('rejects cancelling twice', () => {
      const booked = ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      ctx.services.appointments.cancel(booked.id);
      expectAppError(() => ctx.services.appointments.cancel(booked.id), 409, 'ALREADY_CANCELLED');
    });

    it('rejects cancelling once the appointment has started', () => {
      const booked = ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      ctx.clock.set(new Date(slot.startsAt));
      expectAppError(() => ctx.services.appointments.cancel(booked.id), 422, 'APPOINTMENT_STARTED');
      expect(slotStatus(slot.id)).toBe('booked');
    });

    it('throws NOT_FOUND for an unknown appointment', () => {
      expectAppError(() => ctx.services.appointments.cancel('apt_missing'), 404, 'NOT_FOUND');
    });
  });

  describe('list and get', () => {
    it('filters by patient, provider and status', () => {
      const other = ctx.patient();
      const otherProvider = ctx.provider();
      const a = ctx.services.appointments.book({ patientId: patient.id, slotId: slot.id });
      const b = ctx.services.appointments.book({
        patientId: other.id,
        slotId: ctx.slot(otherProvider.id, 30).id,
      });
      ctx.services.appointments.cancel(b.id);

      const ids = (filter: object) => ctx.services.appointments.list(filter).map((x) => x.id);
      expect(ids({})).toEqual([a.id, b.id]);
      expect(ids({ patientId: patient.id })).toEqual([a.id]);
      expect(ids({ providerId: otherProvider.id })).toEqual([b.id]);
      expect(ids({ status: 'cancelled' })).toEqual([b.id]);
      expect(ctx.services.appointments.get(a.id).id).toBe(a.id);
    });

    it('rejects an unknown status filter', () => {
      expectAppError(
        () => ctx.services.appointments.list({ status: 'nope' }),
        400,
        'VALIDATION_ERROR',
      );
    });

    it('throws NOT_FOUND for an unknown id', () => {
      expectAppError(() => ctx.services.appointments.get('apt_missing'), 404, 'NOT_FOUND');
    });
  });
});
