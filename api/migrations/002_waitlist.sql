-- Waitlist: patients waiting for a slot, and offers of freed slots to them.

CREATE TABLE waitlist_entries (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients (id),
  -- NULL means any provider.
  provider_id TEXT REFERENCES providers (id),
  earliest_at TEXT NOT NULL,
  latest_at   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'offered', 'booked', 'removed')),
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_waitlist_entries_patient ON waitlist_entries (patient_id);
CREATE INDEX idx_waitlist_entries_status ON waitlist_entries (status, created_at);

CREATE TABLE slot_offers (
  id         TEXT PRIMARY KEY,
  entry_id   TEXT NOT NULL REFERENCES waitlist_entries (id),
  slot_id    TEXT NOT NULL REFERENCES slots (id),
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- At most one pending offer per slot and per entry.
CREATE UNIQUE INDEX idx_slot_offers_pending_slot ON slot_offers (slot_id) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_slot_offers_pending_entry ON slot_offers (entry_id) WHERE status = 'pending';
CREATE INDEX idx_slot_offers_entry ON slot_offers (entry_id);
