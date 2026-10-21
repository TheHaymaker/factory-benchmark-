const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Canonical timestamp format: UTC ISO-8601 with milliseconds. */
export function toIso(date: Date): string {
  return date.toISOString();
}

/** Parse a strict UTC ISO timestamp (must end in `Z`). Returns null if invalid. */
export function parseIsoUtc(value: string): Date | null {
  if (!ISO_UTC.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return addMinutes(date, days * 24 * 60);
}
