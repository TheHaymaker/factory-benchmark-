import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, expectAppError, NOW, type TestContext } from './helpers.js';

describe('PatientService', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates a patient with a normalized email and server-assigned fields', () => {
    const patient = ctx.services.patients.create({
      name: '  Jordan Lee ',
      email: 'Jordan.Lee@Example.com',
      phone: '555-0101',
    });
    expect(patient).toMatchObject({
      name: 'Jordan Lee',
      email: 'jordan.lee@example.com',
      phone: '555-0101',
      createdAt: NOW.toISOString(),
    });
    expect(patient.id).toMatch(/^pat_[0-9a-f]{12}$/);
    expect(ctx.services.patients.get(patient.id)).toEqual(patient);
  });

  it('defaults phone to null', () => {
    expect(ctx.services.patients.create({ name: 'A', email: 'a@example.com' }).phone).toBeNull();
  });

  it.each([
    [{ email: 'a@example.com' }, 'missing name'],
    [{ name: 'A' }, 'missing email'],
    [{ name: 'A', email: 'not-an-email' }, 'malformed email'],
    [{ name: 'A'.repeat(101), email: 'a@example.com' }, 'name too long'],
    [{ name: 'A', email: 'a@example.com', phone: 42 }, 'non-string phone'],
    [null, 'non-object body'],
  ])('rejects invalid input (%j: %s)', (body: unknown, _label: string) => {
    expectAppError(() => ctx.services.patients.create(body), 400, 'VALIDATION_ERROR');
  });

  it('rejects duplicate emails case-insensitively', () => {
    ctx.services.patients.create({ name: 'A', email: 'dup@example.com' });
    expectAppError(
      () => ctx.services.patients.create({ name: 'B', email: 'DUP@example.com' }),
      409,
      'EMAIL_TAKEN',
    );
  });

  it('lists patients by name', () => {
    ctx.patient({ name: 'Zoe' });
    ctx.patient({ name: 'Adam' });
    expect(ctx.services.patients.list().map((p) => p.name)).toEqual(['Adam', 'Zoe']);
  });

  it('throws NOT_FOUND for an unknown id', () => {
    expectAppError(() => ctx.services.patients.get('pat_missing'), 404, 'NOT_FOUND');
  });
});
