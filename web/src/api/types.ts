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
  status: 'open' | 'booked';
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
