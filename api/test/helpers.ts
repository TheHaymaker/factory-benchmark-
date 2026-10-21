import { createServices, type Services } from '../src/container.js';
import { openDatabase, type Db } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ControllableClock } from '../src/lib/clock.js';
import { addMinutes, toIso } from '../src/lib/time.js';
import type { Patient, Provider, Slot } from '../src/domain/types.js';

/** Fixed "now" for tests: Monday 2030-01-07 08:00 UTC. */
export const NOW = new Date('2030-01-07T08:00:00.000Z');

export interface TestContext {
  db: Db;
  clock: ControllableClock;
  services: Services;
  provider: (overrides?: Partial<Provider>) => Provider;
  patient: (overrides?: Partial<Patient>) => Patient;
  /** Insert an open slot starting `hoursFromNow` hours after the clock's now. */
  slot: (providerId: string, hoursFromNow?: number, overrides?: Partial<Slot>) => Slot;
}

let counter = 0;

/** Fresh in-memory database with all migrations applied and a frozen clock. */
export function createTestContext(): TestContext {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const clock = new ControllableClock(NOW);
  const services = createServices(db, clock);

  return {
    db,
    clock,
    services,
    provider(overrides = {}) {
      const provider: Provider = {
        id: `prv_test${++counter}`,
        name: 'Dr. Test',
        specialty: 'General',
        createdAt: toIso(clock.now()),
        ...overrides,
      };
      db.prepare(
        'INSERT INTO providers (id, name, specialty, created_at) VALUES (@id, @name, @specialty, @createdAt)',
      ).run(provider);
      return provider;
    },
    patient(overrides = {}) {
      const n = ++counter;
      return services.patients.create({
        name: `Patient ${n}`,
        email: `patient${n}@example.com`,
        ...overrides,
      });
    },
    slot(providerId, hoursFromNow = 24, overrides = {}) {
      const start = addMinutes(clock.now(), hoursFromNow * 60);
      const slot: Slot = {
        id: `slt_test${++counter}`,
        providerId,
        startsAt: toIso(start),
        endsAt: toIso(addMinutes(start, 30)),
        status: 'open',
        createdAt: toIso(clock.now()),
        ...overrides,
      };
      db.prepare(
        `INSERT INTO slots (id, provider_id, starts_at, ends_at, status, created_at)
         VALUES (@id, @providerId, @startsAt, @endsAt, @status, @createdAt)`,
      ).run(slot);
      return slot;
    },
  };
}

/** Assert that `fn` throws an AppError with the given status and code. */
export function expectAppError(fn: () => unknown, status: number, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  if (!caught) throw new Error(`Expected ${status} ${code}, but nothing was thrown`);
  const { status: s, code: c } = caught as { status?: number; code?: string };
  if (s !== status || c !== code) {
    throw new Error(`Expected ${status} ${code}, got ${s} ${c}: ${String(caught)}`);
  }
}
