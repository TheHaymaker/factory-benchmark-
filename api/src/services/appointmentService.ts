import type { Clock } from '../lib/clock.js';
import { businessRule, conflict, notFound, validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { toIso } from '../lib/time.js';
import { asInput, optionalString, requireString } from '../lib/validate.js';
import type { AppointmentDetails, AppointmentStatus } from '../domain/types.js';
import type {
  AppointmentFilter,
  AppointmentRepository,
} from '../repositories/appointmentRepository.js';
import type { SlotRepository } from '../repositories/slotRepository.js';
import { isBookable } from './availability.js';
import type { PatientService } from './patientService.js';
import type { Transact } from './transaction.js';

const STATUSES: readonly AppointmentStatus[] = ['booked', 'cancelled'];

export class AppointmentService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly slots: SlotRepository,
    private readonly patients: PatientService,
    private readonly clock: Clock,
    private readonly transact: Transact,
  ) {}

  /** @throws 404 NOT_FOUND */
  get(id: string): AppointmentDetails {
    const appointment = this.appointments.findById(id);
    if (!appointment) throw notFound('Appointment', id);
    return appointment;
  }

  /** @throws 400 VALIDATION_ERROR for an unknown status */
  list(filter: { patientId?: string; providerId?: string; status?: string }): AppointmentDetails[] {
    if (filter.status !== undefined && !STATUSES.includes(filter.status as AppointmentStatus)) {
      throw validationError(`status must be one of: ${STATUSES.join(', ')}`);
    }
    return this.appointments.list(filter as AppointmentFilter);
  }

  /**
   * Book an open slot for a patient.
   * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND, 409 SLOT_UNAVAILABLE,
   *         422 OUTSIDE_BOOKING_WINDOW
   */
  book(body: unknown): AppointmentDetails {
    const input = asInput(body);
    const patientId = requireString(input, 'patientId');
    const slotId = requireString(input, 'slotId');
    const reason = optionalString(input, 'reason', 500);
    this.patients.get(patientId);

    const id = newId('apt');
    this.transact(() => {
      const slot = this.slots.findById(slotId);
      if (!slot) throw notFound('Slot', slotId);
      if (slot.status !== 'open') {
        throw conflict('SLOT_UNAVAILABLE', 'This slot is no longer available');
      }
      const now = this.clock.now();
      if (!isBookable(slot, now)) {
        throw businessRule('OUTSIDE_BOOKING_WINDOW', 'This slot cannot be booked at this time');
      }
      this.slots.updateStatus(slot.id, 'booked');
      this.appointments.insert({
        id,
        slotId,
        patientId,
        status: 'booked',
        reason,
        createdAt: toIso(now),
        cancelledAt: null,
        cancellationReason: null,
      });
    });
    return this.get(id);
  }

  /**
   * Cancel a booked appointment and reopen its slot. This is the single place
   * cancellation happens — anything that must react to a cancellation belongs here.
   * @throws 404 NOT_FOUND, 409 ALREADY_CANCELLED, 422 APPOINTMENT_STARTED
   */
  cancel(id: string, body: unknown = {}): AppointmentDetails {
    const reason = optionalString(asInput(body), 'reason', 500);
    this.transact(() => {
      const appointment = this.get(id);
      if (appointment.status === 'cancelled') {
        throw conflict('ALREADY_CANCELLED', 'Appointment is already cancelled');
      }
      const now = this.clock.now();
      if (Date.parse(appointment.startsAt) <= now.getTime()) {
        throw businessRule(
          'APPOINTMENT_STARTED',
          'Appointments cannot be cancelled after they start',
        );
      }
      this.appointments.markCancelled(id, toIso(now), reason);
      this.slots.updateStatus(appointment.slotId, 'open');
    });
    return this.get(id);
  }
}
