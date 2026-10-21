import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { MIGRATIONS_DIR, runMigrations } from '../src/db/migrate.js';
import { resetDatabase } from '../src/db/reset.js';
import { seedDemoData } from '../src/db/seed.js';
import { ControllableClock } from '../src/lib/clock.js';
import { NOW } from './helpers.js';

const tableNames = (db: ReturnType<typeof openDatabase>) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();

describe('migrations', () => {
  it('applies every migration to a fresh database', () => {
    const db = openDatabase(':memory:');
    const applied = runMigrations(db);
    expect(applied).toEqual(
      fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort(),
    );
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        'appointments',
        'patients',
        'providers',
        'schema_migrations',
        'slots',
      ]),
    );
  });

  it('is idempotent', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(runMigrations(db)).toEqual([]);
  });

  it('only applies new files on a later run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE a (id TEXT);');
    const db = openDatabase(':memory:');
    expect(runMigrations(db, dir)).toEqual(['001_a.sql']);
    fs.writeFileSync(path.join(dir, '002_b.sql'), 'CREATE TABLE b (id TEXT);');
    expect(runMigrations(db, dir)).toEqual(['002_b.sql']);
  });

  it('rolls back a failing migration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    fs.writeFileSync(path.join(dir, '001_bad.sql'), 'CREATE TABLE ok (id TEXT); NOT SQL;');
    const db = openDatabase(':memory:');
    expect(() => runMigrations(db, dir)).toThrow();
    expect(tableNames(db)).not.toContain('ok');
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(0);
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO slots (id, provider_id, starts_at, ends_at, created_at) VALUES ('s', 'nope', 'a', 'b', 'c')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('seed and reset', () => {
  it('seeds demo data and reset empties every table', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    seedDemoData(db, new ControllableClock(NOW));
    const count = (t: string) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get();
    expect(count('providers')).toBe(3);
    expect(count('patients')).toBe(5);
    expect(count('appointments')).toBeGreaterThan(0);
    expect(
      db
        .prepare("SELECT COUNT(*) FROM slots WHERE provider_id = 'prv_park' AND status = 'open'")
        .pluck()
        .get(),
    ).toBe(0);

    resetDatabase(db);
    for (const t of ['providers', 'patients', 'slots', 'appointments']) expect(count(t)).toBe(0);
    expect(count('schema_migrations')).toBeGreaterThan(0);
  });
});
