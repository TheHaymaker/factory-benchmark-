-- Append-only audit log for waitlist activity.

CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  actor_id    TEXT,
  at          TEXT NOT NULL
);

CREATE INDEX idx_audit_events_entity ON audit_events (entity_id, at);

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
