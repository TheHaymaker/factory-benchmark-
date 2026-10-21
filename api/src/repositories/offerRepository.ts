import type { Db } from '../db/database.js';
import type { SlotOffer, SlotOfferDetails, SlotOfferStatus } from '../domain/types.js';

interface SlotOfferRow {
  id: string;
  entry_id: string;
  slot_id: string;
  status: SlotOfferStatus;
  expires_at: string;
  created_at: string;
}

interface SlotOfferDetailsRow extends SlotOfferRow {
  patient_id: string;
  provider_id: string;
  provider_name: string;
  starts_at: string;
  ends_at: string;
}

function toOffer(row: SlotOfferRow): SlotOffer {
  return {
    id: row.id,
    entryId: row.entry_id,
    slotId: row.slot_id,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function toDetails(row: SlotOfferDetailsRow): SlotOfferDetails {
  return {
    ...toOffer(row),
    patientId: row.patient_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export class OfferRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): SlotOffer | undefined {
    const row = this.db.prepare('SELECT * FROM slot_offers WHERE id = ?').get(id) as
      | SlotOfferRow
      | undefined;
    return row && toOffer(row);
  }

  findPendingForEntry(entryId: string): SlotOffer | undefined {
    const row = this.db
      .prepare("SELECT * FROM slot_offers WHERE entry_id = ? AND status = 'pending'")
      .get(entryId) as SlotOfferRow | undefined;
    return row && toOffer(row);
  }

  /** Pending offers for a patient's entries, with slot and provider details. */
  listPendingForPatient(patientId: string): SlotOfferDetails[] {
    const rows = this.db
      .prepare(
        `SELECT o.*, e.patient_id, s.provider_id, s.starts_at, s.ends_at,
                pr.name AS provider_name
         FROM slot_offers o
         JOIN waitlist_entries e ON e.id = o.entry_id
         JOIN slots s ON s.id = o.slot_id
         JOIN providers pr ON pr.id = s.provider_id
         WHERE e.patient_id = ? AND o.status = 'pending'
         ORDER BY o.created_at, o.rowid`,
      )
      .all(patientId) as SlotOfferDetailsRow[];
    return rows.map(toDetails);
  }

  /** Pending offers whose expiry is at or before `nowIso`. */
  listDue(nowIso: string): SlotOffer[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM slot_offers WHERE status = 'pending' AND expires_at <= ?
         ORDER BY expires_at, rowid`,
      )
      .all(nowIso) as SlotOfferRow[];
    return rows.map(toOffer);
  }

  insert(offer: SlotOffer): SlotOffer {
    this.db
      .prepare(
        `INSERT INTO slot_offers (id, entry_id, slot_id, status, expires_at, created_at)
         VALUES (@id, @entryId, @slotId, @status, @expiresAt, @createdAt)`,
      )
      .run(offer);
    return offer;
  }

  /** Move a pending offer to `status`. Returns false if it was no longer pending. */
  resolvePending(id: string, status: Exclude<SlotOfferStatus, 'pending'>): boolean {
    const result = this.db
      .prepare("UPDATE slot_offers SET status = ? WHERE id = ? AND status = 'pending'")
      .run(status, id);
    return result.changes === 1;
  }
}
