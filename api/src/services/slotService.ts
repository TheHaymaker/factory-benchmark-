import type { Clock } from '../lib/clock.js';
import { conflict, validationError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { addDays, addMinutes, toIso } from '../lib/time.js';
import { asInput, optionalInteger, requireString } from '../lib/validate.js';
import type { Slot } from '../domain/types.js';
import type { SlotRepository } from '../repositories/slotRepository.js';
import { isBookable } from './availability.js';
import type { ProviderService } from './providerService.js';

const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_RANGE_DAYS = 14;

export interface SlotQuery {
  from?: Date | null;
  to?: Date | null;
  /** When true, only slots a patient can book right now are returned. */
  availableOnly?: boolean;
}

function parseStart(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError('startsAt must be a valid date');
  return date;
}

export class SlotService {
  constructor(
    private readonly slots: SlotRepository,
    private readonly providers: ProviderService,
    private readonly clock: Clock,
  ) {}

  /**
   * Slots for a provider ordered by start time. Defaults to the next 14 days.
   * @throws 404 NOT_FOUND if the provider does not exist
   */
  listForProvider(providerId: string, query: SlotQuery = {}): Slot[] {
    this.providers.get(providerId);
    const now = this.clock.now();
    const from = query.from ?? now;
    const to = query.to ?? addDays(from, DEFAULT_RANGE_DAYS);
    const slots = this.slots.listInRange({ providerId, from: toIso(from), to: toIso(to) });
    return query.availableOnly ? slots.filter((slot) => isBookable(slot, now)) : slots;
  }

  /**
   * Staff operation: publish a new open slot for a provider.
   * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND, 409 SLOT_OVERLAP
   */
  create(body: unknown): Slot {
    const input = asInput(body);
    const providerId = requireString(input, 'providerId');
    const startsAt = parseStart(requireString(input, 'startsAt'));
    const duration =
      optionalInteger(input, 'durationMinutes', { min: 5, max: 240 }) ?? DEFAULT_DURATION_MINUTES;
    this.providers.get(providerId);

    const now = this.clock.now();
    if (startsAt <= now) throw validationError('startsAt must be in the future');
    const endsAt = addMinutes(startsAt, duration);
    if (this.slots.findOverlapping(providerId, toIso(startsAt), toIso(endsAt)).length > 0) {
      throw conflict('SLOT_OVERLAP', 'Slot overlaps an existing slot for this provider');
    }

    return this.slots.insert({
      id: newId('slt'),
      providerId,
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      status: 'open',
      createdAt: toIso(now),
    });
  }
}
