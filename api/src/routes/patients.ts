import { Router } from 'express';
import type { PatientService } from '../services/patientService.js';

export function patientsRouter(patients: PatientService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(patients.list());
  });

  router.post('/', (req, res) => {
    res.status(201).json(patients.create(req.body));
  });

  router.get('/:id', (req, res) => {
    res.json(patients.get(req.params.id));
  });

  return router;
}
