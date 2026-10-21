import type { Clock } from '../lib/clock.js';
import { conflict, notFound, validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { toIso } from '../lib/time.js';
import { asInput, requireIsoTimestamp, requireString } from '../lib/validate.js';
import type { WaitlistEntry, WaitlistEntryDetails } from '../domain/types.js';
import type { WaitlistRepository } from '../repositories/waitlistRepository.js';
import type { AuditService } from './auditService.js';
import type { OfferService } from './offerService.js';
import type { PatientService } from './patientService.js';
import type { ProviderService } from './providerService.js';
import type { Transact } from './transaction.js';

export class WaitlistService {
  constructor(
    private readonly entries: WaitlistRepository,
    private readonly patients: PatientService,
    private readonly providers: ProviderService,
    private readonly offers: OfferService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly transact: Transact,
  ) {}

  /**
   * Join the waitlist for one provider, or any provider (`providerId` null/omitted).
   * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND, 409 DUPLICATE_ENTRY
   */
  join(body: unknown): WaitlistEntry {
    const input = asInput(body);
    const patientId = requireString(input, 'patientId');
    const providerId =
      input.providerId === undefined || input.providerId === null
        ? null
        : requireString(input, 'providerId');
    const earliestAt = requireIsoTimestamp(input, 'earliestAt');
    const latestAt = requireIsoTimestamp(input, 'latestAt');
    if (latestAt <= earliestAt) throw validationError('latestAt must be after earliestAt');
    const now = this.clock.now();
    if (latestAt <= now) throw validationError('The waitlist window is in the past');
    this.patients.get(patientId);
    if (providerId !== null) this.providers.get(providerId);

    return this.transact(() => {
      const earliest = toIso(earliestAt);
      const latest = toIso(latestAt);
      if (this.entries.findOverlapping(patientId, providerId, earliest, latest).length > 0) {
        throw conflict(
          'DUPLICATE_ENTRY',
          'This patient is already waiting for this provider in an overlapping window',
        );
      }
      const entry = this.entries.insert({
        id: newId('wl'),
        patientId,
        providerId,
        earliestAt: earliest,
        latestAt: latest,
        status: 'active',
        createdAt: toIso(now),
      });
      this.audit.record('waitlist_entry', entry.id, 'joined', patientId);
      return entry;
    });
  }

  /**
   * A patient's entries except removed ones, oldest first.
   * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND
   */
  listForPatient(patientId: string | undefined): WaitlistEntry[] {
    if (!patientId) throw validationError('patientId is required');
    this.patients.get(patientId);
    this.offers.expireDue();
    return this.entries.listForPatient(patientId);
  }

  /**
   * Staff view: non-removed entries with names, optionally for one provider.
   * @throws 404 NOT_FOUND for an unknown provider
   */
  listForStaff(providerId: string | undefined): WaitlistEntryDetails[] {
    if (providerId) this.providers.get(providerId);
    this.offers.expireDue();
    return this.entries.listDetails({ providerId });
  }

  /**
   * Leave the waitlist. A pending offer is declined and passed on.
   * @throws 404 NOT_FOUND (unknown or removed), 409 ENTRY_BOOKED
   */
  leave(id: string): void {
    this.offers.expireDue();
    this.transact(() => {
      const entry = this.entries.findById(id);
      if (!entry || entry.status === 'removed') throw notFound('Waitlist entry', id);
      if (entry.status === 'booked') {
        throw conflict('ENTRY_BOOKED', 'A booked waitlist entry cannot be removed');
      }
      this.offers.withdrawEntry(entry);
    });
  }
}
