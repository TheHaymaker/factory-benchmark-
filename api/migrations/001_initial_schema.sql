-- Initial schema: patients, providers, appointment slots and appointments.
-- All timestamps are UTC ISO-8601 strings (e.g. 2030-01-15T09:00:00.000Z).

CREATE TABLE patients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE providers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  specialty  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE slots (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers (id),
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL,
  UNIQUE (provider_id, starts_at)
);

CREATE INDEX idx_slots_provider_starts_at ON slots (provider_id, starts_at);

CREATE TABLE appointments (
  id                  TEXT PRIMARY KEY,
  slot_id             TEXT NOT NULL REFERENCES slots (id),
  patient_id          TEXT NOT NULL REFERENCES patients (id),
  status              TEXT NOT NULL DEFAULT 'booked',
  reason              TEXT,
  created_at          TEXT NOT NULL,
  cancelled_at        TEXT,
  cancellation_reason TEXT
);

-- At most one live booking per slot.
CREATE UNIQUE INDEX idx_appointments_active_slot ON appointments (slot_id) WHERE status = 'booked';
CREATE INDEX idx_appointments_patient ON appointments (patient_id);
