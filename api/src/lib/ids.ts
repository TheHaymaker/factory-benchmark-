import { randomUUID } from 'node:crypto';

/** Entity ids are opaque strings: `<prefix>_<12 hex chars>`, e.g. `pat_3f9a0c1b2d4e`. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
