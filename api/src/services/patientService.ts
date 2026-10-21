import type { Clock } from '../lib/clock.js';
import { conflict, notFound, validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { toIso } from '../lib/time.js';
import { asInput, optionalString, requireString } from '../lib/validate.js';
import type { Patient } from '../domain/types.js';
import type { PatientRepository } from '../repositories/patientRepository.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PatientService {
  constructor(
    private readonly patients: PatientRepository,
    private readonly clock: Clock,
  ) {}

  list(): Patient[] {
    return this.patients.list();
  }

  /** @throws 404 NOT_FOUND */
  get(id: string): Patient {
    const patient = this.patients.findById(id);
    if (!patient) throw notFound('Patient', id);
    return patient;
  }

  /**
   * Register a patient. Emails are stored lower-cased and must be unique.
   * @throws 400 VALIDATION_ERROR, 409 EMAIL_TAKEN
   */
  create(body: unknown): Patient {
    const input = asInput(body);
    const name = requireString(input, 'name', 100);
    const email = requireString(input, 'email', 200).toLowerCase();
    const phone = optionalString(input, 'phone', 30);
    if (!EMAIL.test(email)) throw validationError('email must be a valid email address');
    if (this.patients.findByEmail(email)) {
      throw conflict('EMAIL_TAKEN', `A patient with email ${email} already exists`);
    }
    return this.patients.insert({
      id: newId('pat'),
      name,
      email,
      phone,
      createdAt: toIso(this.clock.now()),
    });
  }
}
