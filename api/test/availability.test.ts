import { describe, expect, it } from 'vitest';
import { isBookable } from '../src/services/availability.js';
import { NOW } from './helpers.js';

const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

describe('isBookable', () => {
  it('requires the slot to be open', () => {
    expect(isBookable({ status: 'open', startsAt: at(24) }, NOW)).toBe(true);
    expect(isBookable({ status: 'booked', startsAt: at(24) }, NOW)).toBe(false);
  });

  it('requires at least two hours of notice', () => {
    expect(isBookable({ status: 'open', startsAt: at(2) }, NOW)).toBe(true);
    expect(isBookable({ status: 'open', startsAt: at(1.9) }, NOW)).toBe(false);
  });

  it('does not allow booking more than 60 days ahead', () => {
    expect(isBookable({ status: 'open', startsAt: at(60 * 24) }, NOW)).toBe(true);
    expect(isBookable({ status: 'open', startsAt: at(60 * 24 + 1) }, NOW)).toBe(false);
  });
});
