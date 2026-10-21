import { Router } from 'express';
import type { SlotService } from '../services/slotService.js';

/** Staff-only operations. (Auth is out of scope; the prefix marks intent.) */
export function staffRouter(slots: SlotService): Router {
  const router = Router();

  router.post('/slots', (req, res) => {
    res.status(201).json(slots.create(req.body));
  });

  return router;
}
