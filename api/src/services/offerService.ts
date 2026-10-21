import type { Clock } from '../lib/clock.js';
import { AppError, conflict, notFound, validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { addMinutes, toIso } from '../lib/time.js';
import { asInput, requireString } from '../lib/validate.js';
import type {
  AppointmentDetails,
  SlotOffer,
  SlotOfferDetails,
  WaitlistEntry,
  WaitlistEntryStatus,
} from '../domain/types.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { OfferRepository } from '../repositories/offerRepository.js';
import type { SlotRepository } from '../repositories/slotRepository.js';
import type { WaitlistRepository } from '../repositories/waitlistRepository.js';
import type { AuditService } from './auditService.js';
import type { Notifier } from './notifier.js';
import type { PatientService } from './patientService.js';
import type { Transact } from './transaction.js';

export const DEFAULT_OFFER_TTL_MINUTES = 15;

/** Reacts to a slot being freed by a cancellation. */
export interface SlotReleaseHandler {
  slotReleased(slotId: string): void;
}

/**
 * The offer engine: offers freed slots to waiting patients, and handles accept,
 * decline and expiry. While an offer is pending its slot has status `held`.
 */
export class OfferService implements SlotReleaseHandler {
  constructor(
    private readonly offers: OfferRepository,
    private readonly entries: WaitlistRepository,
    private readonly slots: SlotRepository,
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
    private readonly transact: Transact,
    private readonly ttlMinutes: number = DEFAULT_OFFER_TTL_MINUTES,
  ) {}

  /** Called after a cancellation commits: offer the slot to the next eligible entry. */
  slotReleased(slotId: string): void {
    this.transact(() => this.offerToNext(slotId));
  }

  /**
   * Pending offers for a patient (expiring due offers first).
   * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND
   */
  listPendingForPatient(patientId: string | undefined): SlotOfferDetails[] {
    if (!patientId) throw validationError('patientId is required');
    this.patients.get(patientId);
    this.expireDue();
    return this.offers.listPendingForPatient(patientId);
  }

  /**
   * Book the offered slot for the entry's patient.
   * @throws 404 NOT_FOUND, 409 OFFER_NOT_PENDING, 410 OFFER_EXPIRED
   */
  accept(id: string): AppointmentDetails {
    // Expiry is committed on its own, so a 410 below does not roll it back.
    this.expireDue();
    const bookedId = this.transact(() => {
      const offer = this.requirePending(id);
      const slot = this.slots.findById(offer.slotId);
      if (!slot || slot.status !== 'held') {
        throw conflict('SLOT_UNAVAILABLE', 'This slot is no longer available');
      }
      const entry = this.requireEntry(offer.entryId);
      const now = toIso(this.clock.now());
      if (!this.offers.resolvePending(offer.id, 'accepted')) throw this.notPending();
      this.entries.updateStatus(entry.id, 'booked');
      this.slots.updateStatus(slot.id, 'booked');
      const appointmentId = newId('apt');
      this.appointments.insert({
        id: appointmentId,
        slotId: slot.id,
        patientId: entry.patientId,
        status: 'booked',
        reason: null,
        createdAt: now,
        cancelledAt: null,
        cancellationReason: null,
      });
      this.audit.record('slot_offer', offer.id, 'accepted', entry.patientId);
      this.audit.record('waitlist_entry', entry.id, 'booked', entry.patientId);
      return appointmentId;
    });
    return this.appointments.findById(bookedId)!;
  }

  /**
   * Decline an offer; the slot passes to the next eligible entry.
   * @throws 404 NOT_FOUND, 409 OFFER_NOT_PENDING, 410 OFFER_EXPIRED
   */
  decline(id: string): SlotOffer {
    this.expireDue();
    return this.transact(() => {
      const offer = this.requirePending(id);
      const entry = this.requireEntry(offer.entryId);
      this.release(offer, 'declined', 'active', entry.patientId);
      return this.offers.findById(id)!;
    });
  }

  /**
   * Decline the entry's pending offer (if any) as part of leaving the waitlist, and
   * pass the slot on. The entry ends up `removed`. Call inside a transaction.
   */
  withdrawEntry(entry: WaitlistEntry): void {
    const offer = this.offers.findPendingForEntry(entry.id);
    if (offer) {
      this.release(offer, 'declined', 'removed', entry.patientId);
    } else {
      this.entries.updateStatus(entry.id, 'removed');
      this.audit.record('waitlist_entry', entry.id, 'removed', entry.patientId);
    }
  }

  /** Expire every pending offer whose expiry has passed. Returns how many expired. */
  expireDue(): number {
    return this.transact(() => {
      const due = this.offers.listDue(toIso(this.clock.now()));
      let count = 0;
      for (const offer of due) {
        if (this.release(offer, 'expired', 'active', null)) count += 1;
      }
      return count;
    });
  }

  /**
   * Staff: offer a specific open slot to a specific active entry, ignoring order
   * and the entry's window.
   * @throws 400, 404 NOT_FOUND, 409 SLOT_NOT_OPEN | ENTRY_HAS_PENDING_OFFER | ENTRY_NOT_ACTIVE
   */
  createManual(body: unknown): SlotOffer {
    const input = asInput(body);
    const entryId = requireString(input, 'entryId');
    const slotId = requireString(input, 'slotId');
    this.expireDue();
    return this.transact(() => {
      const entry = this.requireEntry(entryId);
      const slot = this.slots.findById(slotId);
      if (!slot) throw notFound('Slot', slotId);
      if (this.offers.findPendingForEntry(entry.id)) {
        throw conflict('ENTRY_HAS_PENDING_OFFER', 'This entry already has a pending offer');
      }
      if (entry.status !== 'active') {
        throw conflict('ENTRY_NOT_ACTIVE', `This entry is ${entry.status}`);
      }
      if (slot.status !== 'open') {
        throw conflict('SLOT_NOT_OPEN', 'This slot is not open');
      }
      return this.createOffer(entry, slot.id, slot.startsAt, 'staff');
    });
  }

  private requireEntry(id: string): WaitlistEntry {
    const entry = this.entries.findById(id);
    if (!entry) throw notFound('Waitlist entry', id);
    return entry;
  }

  private requirePending(id: string): SlotOffer {
    const offer = this.offers.findById(id);
    if (!offer) throw notFound('Offer', id);
    if (offer.status === 'expired') {
      throw new AppError(410, 'OFFER_EXPIRED', 'This offer has expired');
    }
    if (offer.status !== 'pending') throw this.notPending();
    return offer;
  }

  private notPending(): AppError {
    return conflict('OFFER_NOT_PENDING', 'This offer is no longer pending');
  }

  /** Resolve a pending offer and pass its slot on. Returns false if it was not pending. */
  private release(
    offer: SlotOffer,
    status: 'declined' | 'expired',
    entryStatus: WaitlistEntryStatus,
    actorId: string | null,
  ): boolean {
    if (!this.offers.resolvePending(offer.id, status)) return false;
    const entry = this.entries.findById(offer.entryId);
    if (entry) {
      this.entries.updateStatus(entry.id, entryStatus);
      this.audit.record(
        'waitlist_entry',
        entry.id,
        entryStatus === 'removed' ? 'removed' : 'reactivated',
        actorId,
      );
    }
    this.audit.record('slot_offer', offer.id, status, actorId);
    if (status === 'expired' && entry) {
      this.notifier.send({
        patientId: entry.patientId,
        type: 'offer_expired',
        body: 'Your offered appointment slot has expired. You are still on the waitlist.',
      });
    }
    this.offerToNext(offer.slotId);
    return true;
  }

  /** Offer the slot to the next eligible entry, or reopen it. Call inside a transaction. */
  private offerToNext(slotId: string): SlotOffer | null {
    const slot = this.slots.findById(slotId);
    if (!slot || slot.status === 'booked') return null;
    if (Date.parse(slot.startsAt) <= this.clock.now().getTime()) {
      this.slots.updateStatus(slot.id, 'open');
      return null;
    }
    const [entry] = this.entries.findEligible(slot);
    if (!entry) {
      this.slots.updateStatus(slot.id, 'open');
      return null;
    }
    return this.createOffer(entry, slot.id, slot.startsAt, null);
  }

  private createOffer(
    entry: WaitlistEntry,
    slotId: string,
    startsAt: string,
    actorId: string | null,
  ): SlotOffer {
    const now = this.clock.now();
    const offer = this.offers.insert({
      id: newId('off'),
      entryId: entry.id,
      slotId,
      status: 'pending',
      expiresAt: toIso(addMinutes(now, this.ttlMinutes)),
      createdAt: toIso(now),
    });
    this.entries.updateStatus(entry.id, 'offered');
    this.slots.updateStatus(slotId, 'held');
    this.audit.record('slot_offer', offer.id, 'created', actorId);
    this.audit.record('waitlist_entry', entry.id, 'offered', actorId);
    this.notifier.send({
      patientId: entry.patientId,
      type: 'offer_created',
      body: `An appointment slot at ${startsAt} is available for you. Respond by ${offer.expiresAt}.`,
    });
    return offer;
  }
}
