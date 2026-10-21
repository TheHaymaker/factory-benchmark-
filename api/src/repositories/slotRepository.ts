import type { Db } from '../db/database.js';
import type { Slot, SlotStatus } from '../domain/types.js';

interface SlotRow {
  id: string;
  provider_id: string;
  starts_at: string;
  ends_at: string;
  status: SlotStatus;
  created_at: string;
}

function toSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    providerId: row.provider_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface SlotRange {
  providerId: string;
  /** Inclusive lower bound on `startsAt`. */
  from: string;
  /** Exclusive upper bound on `startsAt`. */
  to: string;
}

export class SlotRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): Slot | undefined {
    const row = this.db.prepare('SELECT * FROM slots WHERE id = ?').get(id) as SlotRow | undefined;
    return row && toSlot(row);
  }

  listInRange({ providerId, from, to }: SlotRange): Slot[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM slots
         WHERE provider_id = ? AND starts_at >= ? AND starts_at < ?
         ORDER BY starts_at`,
      )
      .all(providerId, from, to) as SlotRow[];
    return rows.map(toSlot);
  }

  /** Slots for the provider whose time range intersects [startsAt, endsAt). */
  findOverlapping(providerId: string, startsAt: string, endsAt: string): Slot[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM slots
         WHERE provider_id = ? AND starts_at < ? AND ends_at > ?`,
      )
      .all(providerId, endsAt, startsAt) as SlotRow[];
    return rows.map(toSlot);
  }

  insert(slot: Slot): Slot {
    this.db
      .prepare(
        `INSERT INTO slots (id, provider_id, starts_at, ends_at, status, created_at)
         VALUES (@id, @providerId, @startsAt, @endsAt, @status, @createdAt)`,
      )
      .run(slot);
    return slot;
  }

  updateStatus(id: string, status: SlotStatus): void {
    this.db.prepare('UPDATE slots SET status = ? WHERE id = ?').run(status, id);
  }
}
