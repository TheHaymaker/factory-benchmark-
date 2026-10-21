/**
 * Source of "now" for all time-dependent logic. Never call `new Date()` /
 * `Date.now()` in services or repositories; take a Clock instead.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * A clock that follows system time until frozen with `set()`.
 * Used by unit tests and by the dev-only `/api/dev/clock` route.
 */
export class ControllableClock implements Clock {
  private frozen: Date | null;

  constructor(initial: Date | null = null) {
    this.frozen = initial ? new Date(initial.getTime()) : null;
  }

  now(): Date {
    return this.frozen ? new Date(this.frozen.getTime()) : new Date();
  }

  /** Freeze the clock at `date`, or pass `null` to return to system time. */
  set(date: Date | null): void {
    this.frozen = date ? new Date(date.getTime()) : null;
  }

  /** Move the clock forward. Freezes it first if it is following system time. */
  advanceMinutes(minutes: number): void {
    this.frozen = new Date(this.now().getTime() + minutes * 60_000);
  }

  isFrozen(): boolean {
    return this.frozen !== null;
  }
}
