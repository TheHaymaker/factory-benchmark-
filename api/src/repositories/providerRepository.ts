import type { Db } from '../db/database.js';
import type { Provider } from '../domain/types.js';

interface ProviderRow {
  id: string;
  name: string;
  specialty: string;
  created_at: string;
}

function toProvider(row: ProviderRow): Provider {
  return { id: row.id, name: row.name, specialty: row.specialty, createdAt: row.created_at };
}

export class ProviderRepository {
  constructor(private readonly db: Db) {}

  list(): Provider[] {
    const rows = this.db
      .prepare('SELECT * FROM providers ORDER BY name, id')
      .all() as ProviderRow[];
    return rows.map(toProvider);
  }

  findById(id: string): Provider | undefined {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
      | ProviderRow
      | undefined;
    return row && toProvider(row);
  }

  insert(provider: Provider): Provider {
    this.db
      .prepare(
        `INSERT INTO providers (id, name, specialty, created_at)
         VALUES (@id, @name, @specialty, @createdAt)`,
      )
      .run(provider);
    return provider;
  }
}
