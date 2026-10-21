import { Router } from 'express';
import type { AppointmentService } from '../services/appointmentService.js';
import { queryString } from './query.js';

export function appointmentsRouter(appointments: AppointmentService): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(
      appointments.list({
        patientId: queryString(req.query.patientId),
        providerId: queryString(req.query.providerId),
        status: queryString(req.query.status),
      }),
    );
  });

  router.post('/', (req, res) => {
    res.status(201).json(appointments.book(req.body));
  });

  router.get('/:id', (req, res) => {
    res.json(appointments.get(req.params.id));
  });

  router.post('/:id/cancel', (req, res) => {
    res.json(appointments.cancel(req.params.id, req.body ?? {}));
  });

  return router;
}
