import { validationError } from './errors.js';
import { parseIsoUtc } from './time.js';

/**
 * Small helpers for reading untrusted request input. Each throws a 400
 * VALIDATION_ERROR naming the offending field.
 */
export type Input = Record<string, unknown>;

export function asInput(body: unknown): Input {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError('Request body must be a JSON object');
  }
  return body as Input;
}

export function requireString(input: Input, field: string, maxLength = 200): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`${field} is required`);
  }
  if (value.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return value.trim();
}

export function optionalString(input: Input, field: string, maxLength = 200): string | null {
  if (input[field] === undefined || input[field] === null || input[field] === '') return null;
  return requireString(input, field, maxLength);
}

export function requireIsoTimestamp(input: Input, field: string): Date {
  const value = input[field];
  const date = typeof value === 'string' ? parseIsoUtc(value) : null;
  if (!date) {
    throw validationError(`${field} must be a UTC ISO-8601 timestamp`);
  }
  return date;
}

export function optionalIsoTimestamp(input: Input, field: string): Date | null {
  if (input[field] === undefined || input[field] === null) return null;
  return requireIsoTimestamp(input, field);
}

export function optionalInteger(
  input: Input,
  field: string,
  { min, max }: { min: number; max: number },
): number | null {
  const value = input[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}
