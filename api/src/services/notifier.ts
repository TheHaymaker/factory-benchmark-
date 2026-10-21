import type { Clock } from '../lib/clock.js';
import { toIso } from '../lib/time.js';
import type { Notification } from '../domain/types.js';

export type NotificationMessage = Omit<Notification, 'sentAt'>;

/** Sends messages to patients. The only implementation today is the in-memory stub. */
export interface Notifier {
  send(message: NotificationMessage): void;
}

/** Stub notifier: records messages so tests can inspect them via `GET /api/dev/notifications`. */
export class InMemoryNotifier implements Notifier {
  private sent: Notification[] = [];

  constructor(private readonly clock: Clock) {}

  send(message: NotificationMessage): void {
    this.sent.push({ ...message, sentAt: toIso(this.clock.now()) });
  }

  list(): Notification[] {
    return [...this.sent];
  }

  clear(): void {
    this.sent = [];
  }
}
