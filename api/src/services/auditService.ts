import type { Clock } from '../lib/clock.js';
import { validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { toIso } from '../lib/time.js';
import type { AuditEvent } from '../domain/types.js';
import type { AuditRepository } from '../repositories/auditRepository.js';

export class AuditService {
  constructor(
    private readonly events: AuditRepository,
    private readonly clock: Clock,
  ) {}

  /** Append an event. Call inside the transaction of the change it describes. */
  record(
    entityType: AuditEvent['entityType'],
    entityId: string,
    action: string,
    actorId: string | null = null,
  ): void {
    this.events.insert({
      id: newId('aud'),
      entityType,
      entityId,
      action,
      actorId,
      at: toIso(this.clock.now()),
    });
  }

  /** @throws 400 VALIDATION_ERROR when entityId is missing */
  listForEntity(entityId: string | undefined): AuditEvent[] {
    if (!entityId) throw validationError('entityId is required');
    return this.events.listForEntity(entityId);
  }
}
