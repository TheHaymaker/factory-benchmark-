import { inTransaction, type Db } from './db/database.js';
import type { Clock } from './lib/clock.js';
import { AppointmentRepository } from './repositories/appointmentRepository.js';
import { PatientRepository } from './repositories/patientRepository.js';
import { ProviderRepository } from './repositories/providerRepository.js';
import { SlotRepository } from './repositories/slotRepository.js';
import { AppointmentService } from './services/appointmentService.js';
import { PatientService } from './services/patientService.js';
import { ProviderService } from './services/providerService.js';
import { SlotService } from './services/slotService.js';
import type { Transact } from './services/transaction.js';

export interface Services {
  patients: PatientService;
  providers: ProviderService;
  slots: SlotService;
  appointments: AppointmentService;
}

/** Composition root: wires repositories and services. */
export function createServices(db: Db, clock: Clock): Services {
  const transact: Transact = (fn) => inTransaction(db, fn);

  const patientRepository = new PatientRepository(db);
  const providerRepository = new ProviderRepository(db);
  const slotRepository = new SlotRepository(db);
  const appointmentRepository = new AppointmentRepository(db);

  const patients = new PatientService(patientRepository, clock);
  const providers = new ProviderService(providerRepository);
  const slots = new SlotService(slotRepository, providers, clock);
  const appointments = new AppointmentService(
    appointmentRepository,
    slotRepository,
    patients,
    clock,
    transact,
  );

  return { patients, providers, slots, appointments };
}
