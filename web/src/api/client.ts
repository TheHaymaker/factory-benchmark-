import type {
  Appointment,
  Patient,
  PendingOffer,
  Provider,
  Slot,
  SlotOffer,
  StaffWaitlistEntry,
  WaitlistEntry,
} from './types';

/** Error thrown for any non-2xx response; mirrors the API's `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, error?.code ?? 'UNKNOWN', error?.message ?? res.statusText);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  listProviders: () => request<Provider[]>('/providers'),
  getProvider: (id: string) => request<Provider>(`/providers/${encodeURIComponent(id)}`),
  listAvailableSlots: (providerId: string) =>
    request<Slot[]>(`/providers/${encodeURIComponent(providerId)}/slots?available=true`),

  listPatients: () => request<Patient[]>('/patients'),
  createPatient: (input: { name: string; email: string; phone?: string }) =>
    post<Patient>('/patients', input),

  listAppointments: (filter: { patientId?: string; providerId?: string }) =>
    request<Appointment[]>(`/appointments?${new URLSearchParams(filter).toString()}`),
  bookAppointment: (input: { patientId: string; slotId: string; reason?: string }) =>
    post<Appointment>('/appointments', input),
  cancelAppointment: (id: string, reason?: string) =>
    post<Appointment>(`/appointments/${encodeURIComponent(id)}/cancel`, { reason }),

  listWaitlist: (patientId: string) =>
    request<WaitlistEntry[]>(`/waitlist?patientId=${encodeURIComponent(patientId)}`),
  joinWaitlist: (input: {
    patientId: string;
    providerId: string | null;
    earliestAt: string;
    latestAt: string;
  }) => post<WaitlistEntry>('/waitlist', input),
  leaveWaitlist: (id: string) =>
    request<void>(`/waitlist/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listOffers: (patientId: string) =>
    request<PendingOffer[]>(`/offers?patientId=${encodeURIComponent(patientId)}`),
  acceptOffer: (id: string) => post<Appointment>(`/offers/${encodeURIComponent(id)}/accept`, {}),
  declineOffer: (id: string) => post<SlotOffer>(`/offers/${encodeURIComponent(id)}/decline`, {}),

  listStaffWaitlist: () => request<StaffWaitlistEntry[]>('/staff/waitlist'),
  createStaffOffer: (input: { entryId: string; slotId: string }) =>
    post<SlotOffer>('/staff/offers', input),
};
