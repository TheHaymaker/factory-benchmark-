import { Router } from 'express';
import type { AuditService } from '../services/auditService.js';
import type { OfferService } from '../services/offerService.js';
import type { SlotService } from '../services/slotService.js';
import type { WaitlistService } from '../services/waitlistService.js';
import { queryString } from './query.js';

/** Staff-only operations. (Auth is out of scope; the prefix marks intent.) */
export function staffRouter(
  slots: SlotService,
  waitlist: WaitlistService,
  offers: OfferService,
  audit: AuditService,
): Router {
  const router = Router();

  router.post('/slots', (req, res) => {
    res.status(201).json(slots.create(req.body));
  });

  router.get('/waitlist', (req, res) => {
    res.json(waitlist.listForStaff(queryString(req.query.providerId)));
  });

  router.post('/offers', (req, res) => {
    res.status(201).json(offers.createManual(req.body));
  });

  // Test/ops hook: always mounted (not only with dev routes).
  router.post('/offers/expire-due', (_req, res) => {
    res.json({ expiredCount: offers.expireDue() });
  });

  router.get('/audit', (req, res) => {
    res.json(audit.listForEntity(queryString(req.query.entityId)));
  });

  return router;
}
