import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/mockApi';
import { api, ApiError } from './client';

describe('api client', () => {
  it('returns the parsed JSON body', async () => {
    mockApi({ 'GET /providers': [{ id: 'prv_1' }] });
    await expect(api.listProviders()).resolves.toEqual([{ id: 'prv_1' }]);
  });

  it('throws ApiError carrying the API error code and message', async () => {
    mockApi({
      'POST /appointments': () => ({
        status: 409,
        body: { error: { code: 'SLOT_UNAVAILABLE', message: 'This slot is no longer available' } },
      }),
    });
    const error = await api.bookAppointment({ patientId: 'p', slotId: 's' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'SLOT_UNAVAILABLE',
      message: 'This slot is no longer available',
    });
  });

  it('falls back to UNKNOWN when the error body is not in the standard shape', async () => {
    mockApi({ 'GET /patients': () => ({ status: 502, body: 'Bad gateway' }) });
    await expect(api.listPatients()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('encodes query filters', async () => {
    const { calls } = mockApi({ 'GET /appointments?patientId=pat_1': [] });
    await api.listAppointments({ patientId: 'pat_1' });
    expect(calls[0]?.key).toBe('GET /appointments?patientId=pat_1');
  });
});
