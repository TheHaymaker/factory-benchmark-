import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ControllableClock } from '../src/lib/clock.js';
import { loadConfig } from '../src/config.js';
import { NOW } from './helpers.js';

const WINDOW = { earliestAt: '2030-01-08T00:00:00.000Z', latestAt: '2030-01-20T23:59:59.999Z' };

describe('waitlist HTTP API', () => {
  let app: Express;

  beforeEach(async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const clock = new ControllableClock(NOW);
    app = createApp({ db, clock, devClock: clock });
    await request(app).post('/api/dev/reset').send({ seed: true }).expect(204);
  });

  const newPatient = async (n: string) =>
    (
      await request(app)
        .post('/api/patients')
        .send({ name: n, email: `${n}@example.com` })
        .expect(201)
    ).body as { id: string };

  it('joins, offers on cancel, accepts, and audits the whole flow', async () => {
    const waiting = await newPatient('waiting');
    const entry = (
      await request(app)
        .post('/api/waitlist')
        .send({ patientId: waiting.id, providerId: 'prv_ruiz', ...WINDOW })
        .expect(201)
    ).body;
    expect(entry).toMatchObject({ status: 'active', providerId: 'prv_ruiz' });
    expect((await request(app).get(`/api/waitlist?patientId=${waiting.id}`)).body).toHaveLength(1);

    const slot = (
      await request(app)
        .post('/api/staff/slots')
        .send({ providerId: 'prv_ruiz', startsAt: '2030-01-15T14:00:00.000Z' })
        .expect(201)
    ).body;
    const holder = await newPatient('holder');
    const appt = (
      await request(app).post('/api/appointments').send({ patientId: holder.id, slotId: slot.id })
    ).body;
    await request(app).post(`/api/appointments/${appt.id}/cancel`).send({}).expect(200);

    const [offer] = (await request(app).get(`/api/offers?patientId=${waiting.id}`).expect(200))
      .body;
    expect(offer).toMatchObject({ slotId: slot.id, status: 'pending' });
    const staffList = (await request(app).get('/api/staff/waitlist').expect(200)).body;
    expect(staffList[0]).toMatchObject({
      id: entry.id,
      status: 'offered',
      providerName: 'Dr. Ana Ruiz',
    });

    const accepted = await request(app).post(`/api/offers/${offer.id}/accept`).expect(200);
    expect(accepted.body).toMatchObject({ patientId: waiting.id, status: 'booked' });
    const again = await request(app).post(`/api/offers/${offer.id}/decline`).expect(409);
    expect(again.body.error.code).toBe('OFFER_NOT_PENDING');
    await request(app).delete(`/api/waitlist/${entry.id}`).expect(409);

    const audit = (await request(app).get(`/api/staff/audit?entityId=${offer.id}`).expect(200))
      .body;
    expect(audit.map((e: { action: string }) => e.action)).toEqual(['created', 'accepted']);
    const notes = (await request(app).get('/api/dev/notifications').expect(200)).body;
    expect(notes).toEqual([
      expect.objectContaining({ patientId: waiting.id, type: 'offer_created' }),
    ]);
    await request(app).post('/api/dev/reset').send({}).expect(204);
    expect((await request(app).get('/api/dev/notifications')).body).toEqual([]);
  });

  it('rejects bad input and supports leave, manual offers and expire-due', async () => {
    const p = await newPatient('p');
    const bad = await request(app).post('/api/waitlist').send({ patientId: p.id }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await request(app).get('/api/offers').expect(400);
    const entry = (
      await request(app)
        .post('/api/waitlist')
        .send({ patientId: p.id, ...WINDOW })
        .expect(201)
    ).body;
    const slot = (
      await request(app)
        .post('/api/staff/slots')
        .send({ providerId: 'prv_okafor', startsAt: '2030-01-15T14:00:00.000Z' })
        .expect(201)
    ).body;
    const offer = (
      await request(app)
        .post('/api/staff/offers')
        .send({ entryId: entry.id, slotId: slot.id })
        .expect(201)
    ).body;
    expect(offer.status).toBe('pending');
    expect((await request(app).post('/api/staff/offers/expire-due').expect(200)).body).toEqual({
      expiredCount: 0,
    });
    await request(app).post('/api/dev/clock').send({ advanceMinutes: 20 }).expect(200);
    const gone = await request(app).post(`/api/offers/${offer.id}/accept`).expect(410);
    expect(gone.body.error.code).toBe('OFFER_EXPIRED');
    await request(app).delete(`/api/waitlist/${entry.id}`).expect(204);
    await request(app).delete(`/api/waitlist/${entry.id}`).expect(404);
  });

  it('mounts expire-due without dev routes', async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const prod = createApp({ db, clock: new ControllableClock(NOW) });
    await request(prod).post('/api/staff/offers/expire-due').expect(200, { expiredCount: 0 });
  });
});

describe('config', () => {
  it('reads OFFER_TTL_MINUTES with a default of 15', () => {
    expect(loadConfig({}).offerTtlMinutes).toBe(15);
    expect(loadConfig({ OFFER_TTL_MINUTES: '5' }).offerTtlMinutes).toBe(5);
    expect(() => loadConfig({ OFFER_TTL_MINUTES: 'soon' })).toThrow(/OFFER_TTL_MINUTES/);
  });
});
