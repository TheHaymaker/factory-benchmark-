import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, expectAppError, NOW, type TestContext } from './helpers.js';
import type { Patient, Provider } from '../src/domain/types.js';

const WINDOW = { earliestAt: '2030-01-08T00:00:00.000Z', latestAt: '2030-01-20T23:59:59.999Z' };

describe('WaitlistService', () => {
  let ctx: TestContext;
  let provider: Provider;
  let patient: Patient;

  beforeEach(() => {
    ctx = createTestContext();
    provider = ctx.provider({ name: 'Dr. Ruiz' });
    patient = ctx.patient();
  });

  const join = (overrides: Record<string, unknown> = {}) =>
    ctx.services.waitlist.join({
      patientId: patient.id,
      providerId: provider.id,
      ...WINDOW,
      ...overrides,
    });

  describe('join', () => {
    it('creates an active entry stamped with the clock', () => {
      expect(join()).toMatchObject({
        patientId: patient.id,
        providerId: provider.id,
        ...WINDOW,
        status: 'active',
        createdAt: NOW.toISOString(),
      });
    });

    it('treats an omitted or null providerId as any provider', () => {
      expect(join({ providerId: undefined }).providerId).toBeNull();
    });

    it.each([
      ['missing patientId', { patientId: undefined }],
      ['missing earliestAt', { earliestAt: undefined }],
      ['non-UTC timestamp', { latestAt: '2030-01-20' }],
      ['latestAt equal to earliestAt', { latestAt: WINDOW.earliestAt }],
      [
        'window in the past',
        { earliestAt: '2030-01-01T00:00:00.000Z', latestAt: NOW.toISOString() },
      ],
      ['non-string providerId', { providerId: 42 }],
    ])('rejects %s', (_label, overrides) => {
      expectAppError(() => join(overrides), 400, 'VALIDATION_ERROR');
    });

    it('404s for an unknown patient or provider', () => {
      expectAppError(() => join({ patientId: 'pat_nope' }), 404, 'NOT_FOUND');
      expectAppError(() => join({ providerId: 'prv_nope' }), 404, 'NOT_FOUND');
    });

    it('rejects overlapping entries for the same provider, including any-provider', () => {
      join();
      expectAppError(
        () =>
          join({ earliestAt: '2030-01-20T00:00:00.000Z', latestAt: '2030-01-25T00:00:00.000Z' }),
        409,
        'DUPLICATE_ENTRY',
      );
      join({ providerId: null });
      expectAppError(() => join({ providerId: null }), 409, 'DUPLICATE_ENTRY');
    });

    it('allows adjacent windows and other providers', () => {
      join();
      join({ earliestAt: WINDOW.latestAt, latestAt: '2030-01-25T00:00:00.000Z' });
      join({ providerId: ctx.provider().id });
      expect(ctx.services.waitlist.listForPatient(patient.id)).toHaveLength(3);
    });

    it('records an audit event', () => {
      const entry = join();
      expect(ctx.services.audit.listForEntity(entry.id)).toEqual([
        expect.objectContaining({ entityType: 'waitlist_entry', action: 'joined' }),
      ]);
    });
  });

  describe('listForPatient', () => {
    it('lists oldest first and hides removed entries', () => {
      const first = join();
      ctx.clock.advanceMinutes(1);
      const second = join({ providerId: null });
      const removed = join({ providerId: ctx.provider().id });
      ctx.services.waitlist.leave(removed.id);
      expect(ctx.services.waitlist.listForPatient(patient.id).map((e) => e.id)).toEqual([
        first.id,
        second.id,
      ]);
    });

    it('requires an existing patient', () => {
      expectAppError(
        () => ctx.services.waitlist.listForPatient(undefined),
        400,
        'VALIDATION_ERROR',
      );
      expectAppError(() => ctx.services.waitlist.listForPatient('pat_nope'), 404, 'NOT_FOUND');
    });
  });

  describe('listForStaff', () => {
    it('includes names and filters by provider', () => {
      const a = join();
      join({ providerId: null });
      const all = ctx.services.waitlist.listForStaff(undefined);
      expect(all[0]).toMatchObject({
        id: a.id,
        providerName: 'Dr. Ruiz',
        patientName: patient.name,
      });
      expect(all[1]).toMatchObject({ providerName: null });
      expect(ctx.services.waitlist.listForStaff(provider.id).map((e) => e.id)).toEqual([a.id]);
      expectAppError(() => ctx.services.waitlist.listForStaff('prv_nope'), 404, 'NOT_FOUND');
    });
  });

  describe('leave', () => {
    it('removes the entry; a second leave or unknown id is 404', () => {
      const entry = join();
      ctx.services.waitlist.leave(entry.id);
      expectAppError(() => ctx.services.waitlist.leave(entry.id), 404, 'NOT_FOUND');
      expectAppError(() => ctx.services.waitlist.leave('wl_nope'), 404, 'NOT_FOUND');
    });

    it('refuses to remove a booked entry', () => {
      const entry = join();
      ctx.db.prepare("UPDATE waitlist_entries SET status = 'booked' WHERE id = ?").run(entry.id);
      expectAppError(() => ctx.services.waitlist.leave(entry.id), 409, 'ENTRY_BOOKED');
    });
  });
});
