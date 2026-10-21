import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/time.js';
import { createTestContext, expectAppError, NOW, type TestContext } from './helpers.js';

describe('SlotService', () => {
  let ctx: TestContext;
  let providerId: string;
  beforeEach(() => {
    ctx = createTestContext();
    providerId = ctx.provider().id;
  });

  describe('create', () => {
    it('creates an open 30-minute slot by default', () => {
      const slot = ctx.services.slots.create({ providerId, startsAt: '2030-01-08T09:00:00.000Z' });
      expect(slot).toMatchObject({
        providerId,
        startsAt: '2030-01-08T09:00:00.000Z',
        endsAt: '2030-01-08T09:30:00.000Z',
        status: 'open',
      });
      expect(slot.id).toMatch(/^slt_/);
    });

    it('honours durationMinutes', () => {
      const slot = ctx.services.slots.create({
        providerId,
        startsAt: '2030-01-08T09:00:00.000Z',
        durationMinutes: 45,
      });
      expect(slot.endsAt).toBe('2030-01-08T09:45:00.000Z');
    });

    it('rejects slots in the past', () => {
      expectAppError(
        () => ctx.services.slots.create({ providerId, startsAt: '2030-01-07T07:00:00.000Z' }),
        400,
        'VALIDATION_ERROR',
      );
    });

    it.each([
      [{ startsAt: '2030-01-08T09:00:00.000Z' }],
      [{ providerId: 'x', startsAt: 'tomorrow' }],
      [{ providerId: 'x', startsAt: '2030-01-08T09:00:00.000Z', durationMinutes: 2 }],
      [{ providerId: 'x', startsAt: '2030-01-08T09:00:00.000Z', durationMinutes: 30.5 }],
    ])('rejects invalid input %j', (body: unknown) => {
      expectAppError(() => ctx.services.slots.create(body), 400, 'VALIDATION_ERROR');
    });

    it('requires an existing provider', () => {
      expectAppError(
        () =>
          ctx.services.slots.create({
            providerId: 'prv_missing',
            startsAt: '2030-01-08T09:00:00.000Z',
          }),
        404,
        'NOT_FOUND',
      );
    });

    it('rejects overlapping slots for the same provider only', () => {
      ctx.services.slots.create({ providerId, startsAt: '2030-01-08T09:00:00.000Z' });
      expectAppError(
        () => ctx.services.slots.create({ providerId, startsAt: '2030-01-08T09:15:00.000Z' }),
        409,
        'SLOT_OVERLAP',
      );
      // Back-to-back is fine, as is another provider at the same time.
      ctx.services.slots.create({ providerId, startsAt: '2030-01-08T09:30:00.000Z' });
      ctx.services.slots.create({
        providerId: ctx.provider().id,
        startsAt: '2030-01-08T09:00:00.000Z',
      });
    });
  });

  describe('listForProvider', () => {
    it('defaults to the next 14 days, ordered by start time', () => {
      const later = ctx.slot(providerId, 48);
      const sooner = ctx.slot(providerId, 24);
      ctx.slot(providerId, 15 * 24); // beyond default range
      ctx.slot(providerId, -1); // in the past
      expect(ctx.services.slots.listForProvider(providerId).map((s) => s.id)).toEqual([
        sooner.id,
        later.id,
      ]);
    });

    it('supports an explicit range', () => {
      const slot = ctx.slot(providerId, 20 * 24);
      const result = ctx.services.slots.listForProvider(providerId, {
        from: addDays(NOW, 19),
        to: addDays(NOW, 21),
      });
      expect(result.map((s) => s.id)).toEqual([slot.id]);
    });

    it('filters to bookable slots when availableOnly is set', () => {
      const open = ctx.slot(providerId, 24);
      ctx.slot(providerId, 25, { status: 'booked' });
      ctx.slot(providerId, 1); // too soon to book
      expect(
        ctx.services.slots.listForProvider(providerId, { availableOnly: true }).map((s) => s.id),
      ).toEqual([open.id]);
      expect(ctx.services.slots.listForProvider(providerId)).toHaveLength(3);
    });

    it('throws NOT_FOUND for an unknown provider', () => {
      expectAppError(() => ctx.services.slots.listForProvider('prv_missing'), 404, 'NOT_FOUND');
    });
  });
});
