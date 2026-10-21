import { validationError } from '../lib/errors.js';
import { parseIsoUtc } from '../lib/time.js';

/** Read an optional string query parameter (first value wins). */
export function queryString(value: unknown): string | undefined {
  if (Array.isArray(value)) return queryString(value[0]);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Read an optional UTC ISO timestamp query parameter. @throws 400 VALIDATION_ERROR */
export function queryTimestamp(value: unknown, name: string): Date | null {
  const raw = queryString(value);
  if (raw === undefined) return null;
  const date = parseIsoUtc(raw);
  if (!date) throw validationError(`${name} must be a UTC ISO-8601 timestamp`);
  return date;
}
