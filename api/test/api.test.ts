import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ControllableClock } from '../src/lib/clock.js';
import type { Express } from 'express';
import { NOW } from './helpers.js';

describe('HTTP API', () => {
  let app: Express;
  let clock: ControllableClock;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    clock = new ControllableClock(NOW);
    app = createApp({ db, clock, devClock: clock });
  });

  it('reports health', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it('books and cancels through the full route stack', async () => {
    await request(app).post('/api/dev/reset').send({ seed: true }).expect(204);
    const providers = (await request(app).get('/api/providers').expect(200)).body;
    expect(providers).toHaveLength(3);
    const slots = (
      await request(app).get(`/api/providers/${providers[0].id}/slots?available=true`).expect(200)
    ).body;
    const patient = (
      await request(app)
        .post('/api/patients')
        .send({ name: 'Kim', email: 'kim@example.com' })
        .expect(201)
    ).body;

    const booked = await request(app)
      .post('/api/appointments')
      .send({ patientId: patient.id, slotId: slots[0].id })
      .expect(201);
    expect(booked.body).toMatchObject({ status: 'booked', patientName: 'Kim' });

    const mine = (await request(app).get(`/api/appointments?patientId=${patient.id}`).expect(200))
      .body;
    expect(mine.map((a: { id: string }) => a.id)).toEqual([booked.body.id]);

    const cancelled = await request(app)
      .post(`/api/appointments/${booked.body.id}/cancel`)
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await request(app).get(`/api/appointments/${booked.body.id}`).expect(200);
  });

  it('creates slots through the staff route', async () => {
    await request(app).post('/api/dev/reset').send({ seed: true }).expect(204);
    const res = await request(app)
      .post('/api/staff/slots')
      .send({ providerId: 'prv_ruiz', startsAt: '2030-02-01T15:00:00.000Z' })
      .expect(201);
    expect(res.body.status).toBe('open');
  });

  it('uses the standard error shape', async () => {
    const res = await request(app).get('/api/patients/pat_missing').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Patient pat_missing not found' },
    });

    const invalid = await request(app).post('/api/patients').send({}).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed JSON and bad query parameters with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    await request(app).post('/api/dev/reset').send({ seed: true });
    const bad = await request(app).get('/api/providers/prv_ruiz/slots?from=yesterday').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns ROUTE_NOT_FOUND for unknown API paths', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('controls the clock through dev routes', async () => {
    await request(app)
      .post('/api/dev/clock')
      .send({ now: '2031-05-01T00:00:00.000Z' })
      .expect(200, { now: '2031-05-01T00:00:00.000Z', frozen: true });
    await request(app)
      .post('/api/dev/clock')
      .send({ advanceMinutes: 90 })
      .expect(200, { now: '2031-05-01T01:30:00.000Z', frozen: true });
    await request(app).post('/api/dev/clock').send({ now: null }).expect(200);
    expect((await request(app).get('/api/dev/clock')).body.frozen).toBe(false);
  });

  it('does not mount dev routes unless enabled', async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const prod = createApp({ db, clock });
    const res = await request(prod).post('/api/dev/reset').expect(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
