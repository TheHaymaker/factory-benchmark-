import type { Db } from '../db/database.js';
import type { Patient } from '../domain/types.js';

interface PatientRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

export class PatientRepository {
  constructor(private readonly db: Db) {}

  list(): Patient[] {
    const rows = this.db.prepare('SELECT * FROM patients ORDER BY name, id').all() as PatientRow[];
    return rows.map(toPatient);
  }

  findById(id: string): Patient | undefined {
    const row = this.db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as
      | PatientRow
      | undefined;
    return row && toPatient(row);
  }

  findByEmail(email: string): Patient | undefined {
    const row = this.db.prepare('SELECT * FROM patients WHERE email = ?').get(email) as
      | PatientRow
      | undefined;
    return row && toPatient(row);
  }

  insert(patient: Patient): Patient {
    this.db
      .prepare(
        `INSERT INTO patients (id, name, email, phone, created_at)
         VALUES (@id, @name, @email, @phone, @createdAt)`,
      )
      .run(patient);
    return patient;
  }
}
