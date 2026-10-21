import type { Slot } from '../domain/types.js';

const LEAD_MIN = 120;
const HORIZON_D = 60;

export function isBookable(slot: Pick<Slot, 'status' | 'startsAt'>, now: Date): boolean {
  if (slot.status !== 'open') return false;
  const d = Date.parse(slot.startsAt) - now.getTime();
  return d >= LEAD_MIN * 60_000 && d <= HORIZON_D * 86_400_000;
}
