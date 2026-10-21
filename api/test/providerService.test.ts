import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, expectAppError, type TestContext } from './helpers.js';

describe('ProviderService', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('lists providers by name and fetches one by id', () => {
    const b = ctx.provider({ name: 'Dr. B' });
    ctx.provider({ name: 'Dr. A' });
    expect(ctx.services.providers.list().map((p) => p.name)).toEqual(['Dr. A', 'Dr. B']);
    expect(ctx.services.providers.get(b.id)).toEqual(b);
  });

  it('throws NOT_FOUND for an unknown id', () => {
    expectAppError(() => ctx.services.providers.get('prv_missing'), 404, 'NOT_FOUND');
  });
});
