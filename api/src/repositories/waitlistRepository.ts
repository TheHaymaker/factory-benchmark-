import type { Db } from '../db/database.js';
import type { WaitlistEntry, WaitlistEntryDetails, WaitlistEntryStatus } from '../domain/types.js';

interface WaitlistEntryRow {
  id: string;
  patient_id: string;
  provider_id: string | null;
  earliest_at: string;
  latest_at: string;
  status: WaitlistEntryStatus;
  created_at: string;
}

interface WaitlistEntryDetailsRow extends WaitlistEntryRow {
  patient_name: string;
  provider_name: string | null;
}

function toEntry(row: WaitlistEntryRow): WaitlistEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    providerId: row.provider_id,
    earliestAt: row.earliest_at,
    latestAt: row.latest_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toDetails(row: WaitlistEntryDetailsRow): WaitlistEntryDetails {
  return { ...toEntry(row), patientName: row.patient_name, providerName: row.provider_name };
}

export class WaitlistRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): WaitlistEntry | undefined {
    const row = this.db.prepare('SELECT * FROM waitlist_entries WHERE id = ?').get(id) as
      | WaitlistEntryRow
      | undefined;
    return row && toEntry(row);
  }

  /** A patient's entries except removed ones, oldest first. */
  listForPatient(patientId: string): WaitlistEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM waitlist_entries
         WHERE patient_id = ? AND status != 'removed'
         ORDER BY created_at, rowid`,
      )
      .all(patientId) as WaitlistEntryRow[];
    return rows.map(toEntry);
  }

  /** Non-removed entries with patient/provider names, oldest first. */
  listDetails(filter: { providerId?: string } = {}): WaitlistEntryDetails[] {
    const where = filter.providerId ? 'AND e.provider_id = @providerId' : '';
    const rows = this.db
      .prepare(
        `SELECT e.*, pa.name AS patient_name, pr.name AS provider_name
         FROM waitlist_entries e
         JOIN patients pa ON pa.id = e.patient_id
         LEFT JOIN providers pr ON pr.id = e.provider_id
         WHERE e.status != 'removed' ${where}
         ORDER BY e.created_at, e.rowid`,
      )
      .all(filter.providerId ? { providerId: filter.providerId } : {}) as WaitlistEntryDetailsRow[];
    return rows.map(toDetails);
  }

  /** Active/offered entries of the patient, same provider (NULL = NULL), overlapping window. */
  findOverlapping(
    patientId: string,
    providerId: string | null,
    earliestAt: string,
    latestAt: string,
  ): WaitlistEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM waitlist_entries
         WHERE patient_id = ? AND provider_id IS ? AND status IN ('active', 'offered')
           AND earliest_at < ? AND ? < latest_at`,
      )
      .all(patientId, providerId, latestAt, earliestAt) as WaitlistEntryRow[];
    return rows.map(toEntry);
  }

  /**
   * Active entries whose provider matches (or is any) and whose window contains
   * `startsAt`, excluding entries already offered this slot. Oldest first.
   */
  findEligible(slot: { id: string; providerId: string; startsAt: string }): WaitlistEntry[] {
    const rows = this.db
      .prepare(
        `SELECT e.* FROM waitlist_entries e
         WHERE e.status = 'active'
           AND (e.provider_id IS NULL OR e.provider_id = @providerId)
           AND e.earliest_at <= @startsAt AND @startsAt <= e.latest_at
           AND NOT EXISTS (
             SELECT 1 FROM slot_offers o WHERE o.entry_id = e.id AND o.slot_id = @slotId
           )
         ORDER BY e.created_at, e.rowid`,
      )
      .all({
        providerId: slot.providerId,
        startsAt: slot.startsAt,
        slotId: slot.id,
      }) as WaitlistEntryRow[];
    return rows.map(toEntry);
  }

  insert(entry: WaitlistEntry): WaitlistEntry {
    this.db
      .prepare(
        `INSERT INTO waitlist_entries
           (id, patient_id, provider_id, earliest_at, latest_at, status, created_at)
         VALUES (@id, @patientId, @providerId, @earliestAt, @latestAt, @status, @createdAt)`,
      )
      .run(entry);
    return entry;
  }

  updateStatus(id: string, status: WaitlistEntryStatus): void {
    this.db.prepare('UPDATE waitlist_entries SET status = ? WHERE id = ?').run(status, id);
  }
}
