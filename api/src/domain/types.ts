/** API-facing domain types. Field names are camelCase; DB columns are snake_case. */

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

export interface Provider {
  id: string;
  name: string;
  specialty: string;
  createdAt: string;
}

/** `held` while a waitlist offer for the slot is pending. */
export type SlotStatus = 'open' | 'booked' | 'held';

export interface Slot {
  id: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  createdAt: string;
}

export type AppointmentStatus = 'booked' | 'cancelled';

export interface Appointment {
  id: string;
  slotId: string;
  patientId: string;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/** Appointment joined with its slot, provider and patient, as returned by the API. */
export interface AppointmentDetails extends Appointment {
  providerId: string;
  providerName: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
}

export type WaitlistEntryStatus = 'active' | 'offered' | 'booked' | 'removed';

export interface WaitlistEntry {
  id: string;
  patientId: string;
  /** null = any provider. */
  providerId: string | null;
  earliestAt: string;
  latestAt: string;
  status: WaitlistEntryStatus;
  createdAt: string;
}

/** Waitlist entry joined with names, for staff views. */
export interface WaitlistEntryDetails extends WaitlistEntry {
  patientName: string;
  providerName: string | null;
}

export type SlotOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface SlotOffer {
  id: string;
  entryId: string;
  slotId: string;
  status: SlotOfferStatus;
  expiresAt: string;
  createdAt: string;
}

/** Offer joined with its slot and provider, as listed for a patient. */
export interface SlotOfferDetails extends SlotOffer {
  patientId: string;
  providerId: string;
  providerName: string;
  startsAt: string;
  endsAt: string;
}

export interface AuditEvent {
  id: string;
  entityType: 'waitlist_entry' | 'slot_offer';
  entityId: string;
  action: string;
  actorId: string | null;
  at: string;
}

export interface Notification {
  patientId: string;
  type: string;
  sentAt: string;
  body: string;
}
