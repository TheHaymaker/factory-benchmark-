import { vi } from 'vitest';

type Handler = (body: unknown) => { status?: number; body?: unknown };

/**
 * Stub `fetch` with handlers keyed by "METHOD /path" (path without `/api`, query
 * string included). Unmatched requests fail the test loudly.
 */
export function mockApi(handlers: Record<string, Handler | unknown>) {
  const calls: Array<{ key: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(input).replace(/^\/api/, '')}`;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    if (!(key in handlers)) throw new Error(`Unexpected request: ${key}`);
    const handler = handlers[key];
    const result =
      typeof handler === 'function' ? (handler as Handler)(body) : { body: handler as unknown };
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, setHandler: (key: string, h: Handler | unknown) => (handlers[key] = h) };
}

export const fixtures = {
  patient: {
    id: 'pat_1',
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    phone: null,
    createdAt: '2030-01-01T00:00:00.000Z',
  },
  provider: {
    id: 'prv_1',
    name: 'Dr. Ana Ruiz',
    specialty: 'Family Medicine',
    createdAt: '2030-01-01T00:00:00.000Z',
  },
  slot: {
    id: 'slt_1',
    providerId: 'prv_1',
    startsAt: '2030-01-08T09:00:00.000Z',
    endsAt: '2030-01-08T09:30:00.000Z',
    status: 'open',
    createdAt: '2030-01-01T00:00:00.000Z',
  },
  appointment: {
    id: 'apt_1',
    slotId: 'slt_1',
    patientId: 'pat_1',
    status: 'booked',
    reason: null,
    createdAt: '2030-01-01T00:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    providerId: 'prv_1',
    providerName: 'Dr. Ana Ruiz',
    patientName: 'Jordan Lee',
    startsAt: '2030-01-08T09:00:00.000Z',
    endsAt: '2030-01-08T09:30:00.000Z',
  },
};
