import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Open (and create if needed) a SQLite database. Use `:memory:` in tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Run `fn` inside a transaction; rolls back if it throws. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}
