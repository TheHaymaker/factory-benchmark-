import { Router } from 'express';
import type { WaitlistService } from '../services/waitlistService.js';
import { queryString } from './query.js';

export function waitlistRouter(waitlist: WaitlistService): Router {
  const router = Router();

  router.post('/', (req, res) => {
    res.status(201).json(waitlist.join(req.body));
  });

  router.get('/', (req, res) => {
    res.json(waitlist.listForPatient(queryString(req.query.patientId)));
  });

  router.delete('/:id', (req, res) => {
    waitlist.leave(req.params.id);
    res.status(204).end();
  });

  return router;
}
