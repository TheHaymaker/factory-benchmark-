import { Router } from 'express';
import type { ProviderService } from '../services/providerService.js';
import type { SlotService } from '../services/slotService.js';
import { queryString, queryTimestamp } from './query.js';

export function providersRouter(providers: ProviderService, slots: SlotService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(providers.list());
  });

  router.get('/:id', (req, res) => {
    res.json(providers.get(req.params.id));
  });

  router.get('/:id/slots', (req, res) => {
    res.json(
      slots.listForProvider(req.params.id, {
        from: queryTimestamp(req.query.from, 'from'),
        to: queryTimestamp(req.query.to, 'to'),
        availableOnly: queryString(req.query.available) === 'true',
      }),
    );
  });

  return router;
}
