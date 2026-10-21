import type { Db } from '../db/database.js';
import type { AuditEvent } from '../domain/types.js';

interface AuditEventRow {
  id: string;
  entity_type: AuditEvent['entityType'];
  entity_id: string;
  action: string;
  actor_id: string | null;
  at: string;
}

function toEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorId: row.actor_id,
    at: row.at,
  };
}

/** Append-only: there is no update or delete. */
export class AuditRepository {
  constructor(private readonly db: Db) {}

  insert(event: AuditEvent): void {
    this.db
      .prepare(
        `INSERT INTO audit_events (id, entity_type, entity_id, action, actor_id, at)
         VALUES (@id, @entityType, @entityId, @action, @actorId, @at)`,
      )
      .run(event);
  }

  listForEntity(entityId: string): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_events WHERE entity_id = ? ORDER BY at, rowid')
      .all(entityId) as AuditEventRow[];
    return rows.map(toEvent);
  }
}
