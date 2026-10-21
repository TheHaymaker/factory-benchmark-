import type { Db } from '../db/database.js';
import type { Appointment, AppointmentDetails, AppointmentStatus } from '../domain/types.js';

interface AppointmentDetailsRow {
  id: string;
  slot_id: string;
  patient_id: string;
  status: AppointmentStatus;
  reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  provider_id: string;
  provider_name: string;
  patient_name: string;
  starts_at: string;
  ends_at: string;
}

function toDetails(row: AppointmentDetailsRow): AppointmentDetails {
  return {
    id: row.id,
    slotId: row.slot_id,
    patientId: row.patient_id,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    providerId: row.provider_id,
    providerName: row.provider_name,
    patientName: row.patient_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

const DETAILS_SELECT = `
  SELECT a.*, s.provider_id, s.starts_at, s.ends_at,
         pr.name AS provider_name, pa.name AS patient_name
  FROM appointments a
  JOIN slots s ON s.id = a.slot_id
  JOIN providers pr ON pr.id = s.provider_id
  JOIN patients pa ON pa.id = a.patient_id`;

export interface AppointmentFilter {
  patientId?: string;
  providerId?: string;
  status?: AppointmentStatus;
}

export class AppointmentRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): AppointmentDetails | undefined {
    const row = this.db.prepare(`${DETAILS_SELECT} WHERE a.id = ?`).get(id) as
      | AppointmentDetailsRow
      | undefined;
    return row && toDetails(row);
  }

  list(filter: AppointmentFilter = {}): AppointmentDetails[] {
    const clauses: string[] = [];
    const params: Record<string, string> = {};
    if (filter.patientId) {
      clauses.push('a.patient_id = @patientId');
      params.patientId = filter.patientId;
    }
    if (filter.providerId) {
      clauses.push('s.provider_id = @providerId');
      params.providerId = filter.providerId;
    }
    if (filter.status) {
      clauses.push('a.status = @status');
      params.status = filter.status;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`${DETAILS_SELECT} ${where} ORDER BY s.starts_at, a.id`)
      .all(params) as AppointmentDetailsRow[];
    return rows.map(toDetails);
  }

  insert(appointment: Appointment): void {
    this.db
      .prepare(
        `INSERT INTO appointments
           (id, slot_id, patient_id, status, reason, created_at, cancelled_at, cancellation_reason)
         VALUES
           (@id, @slotId, @patientId, @status, @reason, @createdAt, @cancelledAt, @cancellationReason)`,
      )
      .run(appointment);
  }

  markCancelled(id: string, cancelledAt: string, reason: string | null): void {
    this.db
      .prepare(
        `UPDATE appointments
         SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?
         WHERE id = ?`,
      )
      .run(cancelledAt, reason, id);
  }
}
