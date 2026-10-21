import { inTransaction, type Db } from './db/database.js';
import type { Clock } from './lib/clock.js';
import { AppointmentRepository } from './repositories/appointmentRepository.js';
import { AuditRepository } from './repositories/auditRepository.js';
import { OfferRepository } from './repositories/offerRepository.js';
import { PatientRepository } from './repositories/patientRepository.js';
import { ProviderRepository } from './repositories/providerRepository.js';
import { SlotRepository } from './repositories/slotRepository.js';
import { WaitlistRepository } from './repositories/waitlistRepository.js';
import { AppointmentService } from './services/appointmentService.js';
import { AuditService } from './services/auditService.js';
import { InMemoryNotifier } from './services/notifier.js';
import { DEFAULT_OFFER_TTL_MINUTES, OfferService } from './services/offerService.js';
import { PatientService } from './services/patientService.js';
import { ProviderService } from './services/providerService.js';
import { SlotService } from './services/slotService.js';
import type { Transact } from './services/transaction.js';
import { WaitlistService } from './services/waitlistService.js';

export interface Services {
  patients: PatientService;
  providers: ProviderService;
  slots: SlotService;
  appointments: AppointmentService;
  waitlist: WaitlistService;
  offers: OfferService;
  audit: AuditService;
  /** Stub notifier; its messages are exposed by `GET /api/dev/notifications`. */
  notifier: InMemoryNotifier;
}

export interface ServiceOptions {
  offerTtlMinutes?: number;
}

/** Composition root: wires repositories and services. */
export function createServices(db: Db, clock: Clock, options: ServiceOptions = {}): Services {
  const transact: Transact = (fn) => inTransaction(db, fn);

  const patientRepository = new PatientRepository(db);
  const providerRepository = new ProviderRepository(db);
  const slotRepository = new SlotRepository(db);
  const appointmentRepository = new AppointmentRepository(db);
  const waitlistRepository = new WaitlistRepository(db);
  const offerRepository = new OfferRepository(db);
  const auditRepository = new AuditRepository(db);

  const notifier = new InMemoryNotifier(clock);
  const audit = new AuditService(auditRepository, clock);
  const patients = new PatientService(patientRepository, clock);
  const providers = new ProviderService(providerRepository);
  const slots = new SlotService(slotRepository, providers, clock);
  const offers = new OfferService(
    offerRepository,
    waitlistRepository,
    slotRepository,
    appointmentRepository,
    patients,
    audit,
    notifier,
    clock,
    transact,
    options.offerTtlMinutes ?? DEFAULT_OFFER_TTL_MINUTES,
  );
  const appointments = new AppointmentService(
    appointmentRepository,
    slotRepository,
    patients,
    clock,
    transact,
    offers,
  );
  const waitlist = new WaitlistService(
    waitlistRepository,
    patients,
    providers,
    offers,
    audit,
    clock,
    transact,
  );

  return { patients, providers, slots, appointments, waitlist, offers, audit, notifier };
}
