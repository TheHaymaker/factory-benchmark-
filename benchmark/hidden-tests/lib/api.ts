/**
 * Black-box helpers shared by hidden HTTP and Playwright tests. They use only the
 * baseline API and the contracts in TICKETS.md.
 */
export const BASE_URL = (
  process.env.HIDDEN_TARGET_URL ??
  process.env.BASE_URL ??
  'http://localhost:3100'
).replace(/\/$/, '');

/** Frozen "now" for every test: Monday 2030-01-07 08:00 UTC. */
export const T0 = '2030-01-07T08:00:00.000Z';

/** Seeded providers (see api/src/db/seed.ts). */
export const RUIZ = 'prv_ruiz';
export const OKAFOR = 'prv_okafor';

export interface Res<T = any> {
  status: number;
  body: T;
}

export async function call<T = any>(method: string, path: string, body?: unknown): Promise<Res<T>> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { status: res.status, body: parsed as T };
}

export const get = <T = any>(path: string) => call<T>('GET', path);
export const post = <T = any>(path: string, body: unknown = {}) => call<T>('POST', path, body);
export const del = <T = any>(path: string) => call<T>('DELETE', path);

/** Throw with a readable message unless the response has the expected status. */
export function expectStatus<T>(res: Res<T>, status: number, what: string): T {
  if (res.status !== status) {
    throw new Error(`${what}: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

export function errorCode(res: Res): string | undefined {
  return (res.body as { error?: { code?: string } } | null)?.error?.code;
}

/** Reset to seeded demo data with the clock frozen at T0. */
export async function resetWorld(now = T0): Promise<void> {
  expectStatus(await post('/dev/clock', { now }), 200, 'freeze clock');
  expectStatus(await post('/dev/reset', { seed: true }), 204, 'reset');
}

export async function advanceMinutes(minutes: number): Promise<void> {
  expectStatus(await post('/dev/clock', { advanceMinutes: minutes }), 200, 'advance clock');
}

let seq = 0;
export async function createPatient(name?: string): Promise<{ id: string; name: string }> {
  const n = `${Date.now()}${++seq}`;
  return expectStatus(
    await post('/patients', {
      name: name ?? `Hidden Patient ${n}`,
      email: `hidden${n}@example.com`,
    }),
    201,
    'create patient',
  );
}

/** Publish an open slot. Afternoon times avoid the seeded 09:00–12:00 slots. */
export async function createSlot(
  providerId: string,
  startsAt: string,
): Promise<{ id: string; startsAt: string; providerId: string }> {
  return expectStatus(await post('/staff/slots', { providerId, startsAt }), 201, 'create slot');
}

export async function book(patientId: string, slotId: string): Promise<{ id: string }> {
  return expectStatus(await post('/appointments', { patientId, slotId }), 201, 'book');
}

export async function cancel(appointmentId: string): Promise<void> {
  expectStatus(await post(`/appointments/${appointmentId}/cancel`, {}), 200, 'cancel');
}

/** Create a slot, have a throwaway patient book it, and return a function that cancels it. */
export async function bookedSlot(providerId: string, startsAt: string) {
  const slot = await createSlot(providerId, startsAt);
  const holder = await createPatient('Slot Holder');
  const appointment = await book(holder.id, slot.id);
  return { slot, holder, appointment, cancel: () => cancel(appointment.id) };
}

export interface WaitlistInput {
  patientId: string;
  providerId?: string | null;
  earliestAt?: string;
  latestAt?: string;
}

/** Default window: the whole of Jan 8–20, 2030. */
export const WINDOW = {
  earliestAt: '2030-01-08T00:00:00.000Z',
  latestAt: '2030-01-20T23:59:59.999Z',
};

export function joinRaw(input: WaitlistInput) {
  return post('/waitlist', { ...WINDOW, ...input });
}

export async function join(input: WaitlistInput): Promise<{ id: string; status: string }> {
  return expectStatus(await joinRaw(input), 201, 'join waitlist');
}

export async function pendingOffers(
  patientId: string,
): Promise<
  Array<{ id: string; entryId: string; slotId: string; status: string; expiresAt: string }>
> {
  return expectStatus(await get(`/offers?patientId=${patientId}`), 200, 'list offers');
}

export async function entriesFor(
  patientId: string,
): Promise<Array<{ id: string; status: string }>> {
  return expectStatus(await get(`/waitlist?patientId=${patientId}`), 200, 'list waitlist');
}

export async function entryStatus(patientId: string, entryId: string): Promise<string | undefined> {
  return (await entriesFor(patientId)).find((e) => e.id === entryId)?.status;
}

export async function availableSlotIds(providerId: string): Promise<string[]> {
  const slots = expectStatus(
    await get(
      `/providers/${providerId}/slots?available=true&from=${T0}&to=2030-02-01T00:00:00.000Z`,
    ),
    200,
    'list slots',
  ) as Array<{ id: string }>;
  return slots.map((s) => s.id);
}
