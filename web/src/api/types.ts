// Mirrors api/src/domain/types.ts. Keep in sync when the API changes.

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

export interface Slot {
  id: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'booked' | 'held';
  createdAt: string;
}

export interface Appointment {
  id: string;
  slotId: string;
  patientId: string;
  status: 'booked' | 'cancelled';
  reason: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  providerId: string;
  providerName: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
}

export type WaitlistStatus = 'active' | 'offered' | 'booked' | 'removed';

export interface WaitlistEntry {
  id: string;
  patientId: string;
  providerId: string | null;
  earliestAt: string;
  latestAt: string;
  status: WaitlistStatus;
  createdAt: string;
}

export interface StaffWaitlistEntry extends WaitlistEntry {
  patientName: string;
  providerName: string | null;
}

export interface SlotOffer {
  id: string;
  entryId: string;
  slotId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}

/** As returned by `GET /offers?patientId=`: the offer plus its slot's details. */
export interface PendingOffer extends SlotOffer {
  patientId: string;
  providerId: string;
  providerName: string;
  startsAt: string;
  endsAt: string;
}
