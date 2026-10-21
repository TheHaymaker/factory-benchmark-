import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Inspects the running server's database file. run.sh exports DATABASE_PATH.
const file = process.env.DATABASE_PATH;

describe('T1 waitlist schema', () => {
  let db: Database.Database;
  beforeAll(() => {
    if (!file) throw new Error('DATABASE_PATH must point at the server database');
    db = new Database(file, { readonly: true, fileMustExist: true });
  });
  afterAll(() => db?.close());

  const columns = (table: string) =>
    db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
      name: string;
      notnull: number;
      pk: number;
    }>;
  const fks = (table: string) =>
    db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;

  it('creates waitlist_entries with the specified columns', () => {
    const cols = columns('waitlist_entries');
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'patient_id',
        'provider_id',
        'earliest_at',
        'latest_at',
        'status',
        'created_at',
      ]),
    );
    expect(cols.find((c) => c.name === 'id')?.pk).toBe(1);
    expect(cols.find((c) => c.name === 'patient_id')?.notnull).toBe(1);
    expect(cols.find((c) => c.name === 'provider_id')?.notnull).toBe(0);
  });

  it('creates slot_offers with the specified columns', () => {
    const cols = columns('slot_offers');
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'entry_id', 'slot_id', 'status', 'expires_at', 'created_at']),
    );
    expect(cols.find((c) => c.name === 'id')?.pk).toBe(1);
    expect(cols.find((c) => c.name === 'entry_id')?.notnull).toBe(1);
    expect(cols.find((c) => c.name === 'slot_id')?.notnull).toBe(1);
  });

  it('declares foreign keys', () => {
    const entryFks = fks('waitlist_entries').map((f) => `${f.from}->${f.table}`);
    expect(entryFks).toEqual(
      expect.arrayContaining(['patient_id->patients', 'provider_id->providers']),
    );
    const offerFks = fks('slot_offers').map((f) => `${f.from}->${f.table}`);
    expect(offerFks).toEqual(
      expect.arrayContaining(['entry_id->waitlist_entries', 'slot_id->slots']),
    );
  });

  it('records the migration in schema_migrations', () => {
    const names = db.prepare('SELECT name FROM schema_migrations ORDER BY name').pluck().all();
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names[0]).toBe('001_initial_schema.sql');
  });

  it('enforces foreign keys on insert', () => {
    // Copy the schema into memory so we can write without touching the server's DB.
    const mem = new Database(':memory:');
    mem.pragma('foreign_keys = ON');
    const ddl = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
      )
      .pluck()
      .all() as string[];
    for (const sql of ddl) mem.exec(sql);
    expect(() =>
      mem
        .prepare(
          `INSERT INTO waitlist_entries (id, patient_id, provider_id, earliest_at, latest_at, status, created_at)
           VALUES ('e1', 'missing', NULL, '2030-01-01T00:00:00.000Z', '2030-01-02T00:00:00.000Z', 'active', '2030-01-01T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      mem
        .prepare(
          `INSERT INTO slot_offers (id, entry_id, slot_id, status, expires_at, created_at)
           VALUES ('o1', 'missing', 'missing', 'pending', '2030-01-01T00:15:00.000Z', '2030-01-01T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
