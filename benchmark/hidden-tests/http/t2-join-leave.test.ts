import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceMinutes,
  createPatient,
  del,
  entriesFor,
  errorCode,
  get,
  join,
  joinRaw,
  OKAFOR,
  post,
  resetWorld,
  RUIZ,
  T0,
  WINDOW,
} from '../lib/api.js';

describe('T2 join and leave the waitlist', () => {
  let patientId: string;
  beforeEach(async () => {
    await resetWorld();
    patientId = (await createPatient()).id;
  });

  it('creates an active entry and returns it with 201', async () => {
    const res = await joinRaw({ patientId, providerId: RUIZ });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      patientId,
      providerId: RUIZ,
      earliestAt: WINDOW.earliestAt,
      latestAt: WINDOW.latestAt,
      status: 'active',
      createdAt: T0,
    });
    expect(typeof res.body.id).toBe('string');
  });

  it('treats an omitted providerId as any provider (null)', async () => {
    const res = await joinRaw({ patientId });
    expect(res.status).toBe(201);
    expect(res.body.providerId).toBeNull();
  });

  it.each([
    ['missing patientId', { patientId: undefined }],
    ['missing earliestAt', { earliestAt: undefined }],
    ['missing latestAt', { latestAt: undefined }],
    ['non-ISO timestamp', { earliestAt: 'next tuesday' }],
    [
      'latestAt before earliestAt',
      { earliestAt: '2030-01-10T00:00:00.000Z', latestAt: '2030-01-09T00:00:00.000Z' },
    ],
    [
      'latestAt equal to earliestAt',
      { earliestAt: '2030-01-10T00:00:00.000Z', latestAt: '2030-01-10T00:00:00.000Z' },
    ],
    [
      'window entirely in the past',
      { earliestAt: '2030-01-01T00:00:00.000Z', latestAt: '2030-01-06T00:00:00.000Z' },
    ],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, override) => {
    const body: Record<string, unknown> = { patientId, providerId: RUIZ, ...WINDOW, ...override };
    for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
    const res = await post('/waitlist', body);
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('returns 404 NOT_FOUND for an unknown patient or provider', async () => {
    const badPatient = await joinRaw({ patientId: 'pat_does_not_exist', providerId: RUIZ });
    expect(badPatient.status).toBe(404);
    expect(errorCode(badPatient)).toBe('NOT_FOUND');
    const badProvider = await joinRaw({ patientId, providerId: 'prv_does_not_exist' });
    expect(badProvider.status).toBe(404);
    expect(errorCode(badProvider)).toBe('NOT_FOUND');
  });

  it('rejects an overlapping active entry for the same provider with 409 DUPLICATE_ENTRY', async () => {
    await join({ patientId, providerId: RUIZ });
    const dup = await joinRaw({
      patientId,
      providerId: RUIZ,
      earliestAt: '2030-01-15T00:00:00.000Z',
      latestAt: '2030-01-25T00:00:00.000Z',
    });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('DUPLICATE_ENTRY');
  });

  it('treats two any-provider entries as the same provider', async () => {
    await join({ patientId });
    const dup = await joinRaw({ patientId, providerId: null });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('DUPLICATE_ENTRY');
  });

  it('allows a non-overlapping window or a different provider', async () => {
    await join({ patientId, providerId: RUIZ });
    await join({
      patientId,
      providerId: RUIZ,
      earliestAt: '2030-01-25T00:00:00.000Z',
      latestAt: '2030-01-30T00:00:00.000Z',
    });
    await join({ patientId, providerId: OKAFOR });
    expect(await entriesFor(patientId)).toHaveLength(3);
  });

  it('allows rejoining after leaving', async () => {
    const entry = await join({ patientId, providerId: RUIZ });
    expect((await del(`/waitlist/${entry.id}`)).status).toBe(204);
    expect((await joinRaw({ patientId, providerId: RUIZ })).status).toBe(201);
  });

  it("lists the patient's entries oldest first and only theirs", async () => {
    const other = await createPatient();
    const first = await join({ patientId, providerId: RUIZ });
    await advanceMinutes(5);
    const second = await join({ patientId, providerId: OKAFOR });
    await join({ patientId: other.id, providerId: RUIZ });

    const res = await get(`/waitlist?patientId=${patientId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([first.id, second.id]);
  });

  it('requires patientId when listing', async () => {
    const res = await get('/waitlist');
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('leaves the waitlist with 204, hides removed entries, and 404s on repeat', async () => {
    const entry = await join({ patientId, providerId: RUIZ });
    const res = await del(`/waitlist/${entry.id}`);
    expect(res.status).toBe(204);
    expect(await entriesFor(patientId)).toEqual([]);

    const again = await del(`/waitlist/${entry.id}`);
    expect(again.status).toBe(404);
    expect(errorCode(again)).toBe('NOT_FOUND');
  });

  it('returns 404 NOT_FOUND when deleting an unknown entry', async () => {
    const res = await del('/waitlist/wl_does_not_exist');
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
  });
});
