import type { Db } from './database.js';

/**
 * Delete every row from every application table (schema is kept). Discovers
 * tables at runtime, so tables added by new migrations are included automatically.
 */
export function resetDatabase(db: Db): void {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`,
    )
    .all()
    .map((row) => (row as { name: string }).name);

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of tables) db.exec(`DELETE FROM "${table}"`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
