import type { Appointment, Patient, Provider, Slot } from './types';

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
};
