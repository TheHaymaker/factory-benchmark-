import { Router } from 'express';
import type { OfferService } from '../services/offerService.js';
import { queryString } from './query.js';

export function offersRouter(offers: OfferService): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(offers.listPendingForPatient(queryString(req.query.patientId)));
  });

  router.post('/:id/accept', (req, res) => {
    res.json(offers.accept(req.params.id));
  });

  router.post('/:id/decline', (req, res) => {
    res.json(offers.decline(req.params.id));
  });

  return router;
}
