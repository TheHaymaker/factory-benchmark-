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

export type SlotStatus = 'open' | 'booked';

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
