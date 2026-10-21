import type { Clock } from '../lib/clock.js';
import { addDays, addMinutes, toIso } from '../lib/time.js';
import type { Db } from './database.js';

const PROVIDERS = [
  { id: 'prv_ruiz', name: 'Dr. Ana Ruiz', specialty: 'Family Medicine' },
  { id: 'prv_okafor', name: 'Dr. Ben Okafor', specialty: 'Pediatrics' },
  { id: 'prv_park', name: 'Dr. Chloe Park', specialty: 'Dermatology' },
];

const PATIENTS = [
  { id: 'pat_jordan', name: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '555-0101' },
  { id: 'pat_sam', name: 'Sam Patel', email: 'sam.patel@example.com', phone: '555-0102' },
  { id: 'pat_riley', name: 'Riley Chen', email: 'riley.chen@example.com', phone: null },
  { id: 'pat_alex', name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '555-0104' },
  { id: 'pat_casey', name: 'Casey Diaz', email: 'casey.diaz@example.com', phone: null },
];

/** Start of the UTC day containing `date`. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Insert deterministic demo data relative to `clock.now()`: 3 providers,
 * 5 patients, 30-minute slots 09:00–12:00 UTC on each of the next 5 days, and a
 * few bookings. Dermatology (Dr. Park) has only a handful of slots, all booked.
 * Expects empty tables.
 */
export function seedDemoData(db: Db, clock: Clock): void {
  const now = clock.now();
  const createdAt = toIso(now);
  const tomorrow = startOfUtcDay(addDays(now, 1));

  const insertProvider = db.prepare(
    'INSERT INTO providers (id, name, specialty, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertPatient = db.prepare(
    'INSERT INTO patients (id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertSlot = db.prepare(
    `INSERT INTO slots (id, provider_id, starts_at, ends_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAppointment = db.prepare(
    `INSERT INTO appointments (id, slot_id, patient_id, status, reason, created_at)
     VALUES (?, ?, ?, 'booked', ?, ?)`,
  );

  db.transaction(() => {
    for (const p of PROVIDERS) insertProvider.run(p.id, p.name, p.specialty, createdAt);
    for (const p of PATIENTS) insertPatient.run(p.id, p.name, p.email, p.phone, createdAt);

    const bookings: Array<[slotId: string, patientId: string, reason: string]> = [];
    for (const [providerIndex, provider] of PROVIDERS.entries()) {
      const isPark = provider.id === 'prv_park';
      const days = isPark ? 2 : 5;
      const perDay = isPark ? 2 : 6;
      for (let day = 0; day < days; day++) {
        for (let i = 0; i < perDay; i++) {
          const start = addMinutes(addDays(tomorrow, day), 9 * 60 + i * 30);
          const slotId = `slt_${provider.id.slice(4)}_d${day}_${i}`;
          // Fully book Dr. Park; book the first slot of day 0 for the others.
          const booked = isPark || (day === 0 && i === 0);
          insertSlot.run(
            slotId,
            provider.id,
            toIso(start),
            toIso(addMinutes(start, 30)),
            booked ? 'booked' : 'open',
            createdAt,
          );
          if (booked) {
            const patient = PATIENTS[(bookings.length + providerIndex) % PATIENTS.length]!;
            bookings.push([slotId, patient.id, isPark ? 'Skin check' : 'Annual physical']);
          }
        }
      }
    }
    for (const [index, [slotId, patientId, reason]] of bookings.entries()) {
      insertAppointment.run(`apt_seed_${index}`, slotId, patientId, reason, createdAt);
    }
  })();
}
