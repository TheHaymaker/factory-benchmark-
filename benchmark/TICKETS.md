# Waitlist tickets

Eight tickets that together add a **waitlist** to the clinic scheduler. When an
appointment is cancelled, the freed slot is offered to a waiting patient, who can accept
or decline before the offer expires.

Give these to the factory as written. Do not give it [`NOTES.md`](NOTES.md).

## Global conventions (apply to every ticket)

- **Paths.** Every API path below is relative to the API prefix `/api`. For example,
  `POST /waitlist` means `POST /api/waitlist`. The web app's routes (`/waitlist`,
  `/staff/waitlist`) are client-side routes on the same origin.
- **IDs** are opaque strings. **Timestamps** are UTC ISO-8601 strings
  (`2030-01-08T09:00:00.000Z`) in requests and responses.
- **Errors** use the existing shape `{ "error": { "code": "...", "message": "..." } }`.
  Every endpoint may return `400 VALIDATION_ERROR` for malformed input and
  `404 NOT_FOUND` for an unknown id in the path or body.
- **Success bodies** are the resource, or an array of resources, as bare JSON (same as
  the existing API). Responses may include fields beyond those listed.
- **Offer TTL** defaults to **15 minutes**. It can be overridden with the
  `OFFER_TTL_MINUTES` environment variable, read through `api/src/config.ts`.
- **Auth is out of scope.** The patient is identified by `patientId` in the body or
  query. Staff-only routes live under `/staff` (API) and `/staff/...` (web).
- **Time.** All time-dependent logic uses the injected `Clock`. Tests freeze and advance
  it with the existing `POST /dev/clock` test hook.
- **Test hooks are in scope.** `POST /staff/offers/expire-due` (T4) and
  `GET /dev/notifications` (T7) exist so automated tests can drive and observe the
  system. They are required, not scope creep. `/dev/*` routes are mounted only when
  `ENABLE_DEV_ROUTES=1`, and `POST /dev/reset` must keep clearing all data, including
  new tables.
- **`data-testid`s** listed in a ticket are a contract. Do not rename existing ones.
- **Definition of done** (every ticket): `npm run ci` is green, new service code has
  meaningful tests and services stay at 80% or more coverage, conventions in
  `CONVENTIONS.md` are followed, and new endpoints are documented in the README.

### Shared resource shapes

```ts
// GET/POST /waitlist…
interface WaitlistEntry {
  id: string;
  patientId: string;
  providerId: string | null; // null = any provider
  earliestAt: string; // ISO UTC, inclusive
  latestAt: string; // ISO UTC, inclusive
  status: 'active' | 'offered' | 'booked' | 'removed';
  createdAt: string;
}

// GET /offers…, POST /offers/:id/…, POST /staff/offers
interface SlotOffer {
  id: string;
  entryId: string;
  slotId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}
```

A slot **falls inside** an entry's window when `earliestAt <= slot.startsAt <= latestAt`.

### Dependency graph

```
T1 ─► T2 ─► T3 ─► T4 ─► T5
             │     └──► (T5 also needs T2)
             ├──► T6
             ├──► T7
             └──► T8 (also needs T2, T4 for the accept event)
```

---

## T1. Waitlist schema

**Depends on:** none

Add the tables the waitlist needs.

### Description

Add a migration that creates `waitlist_entries` and `slot_offers`. Do not add any API
behaviour in this ticket.

### Acceptance criteria

1. A new migration file in `api/migrations/`, following the existing naming
   (`002_….sql`), creates:
   - `waitlist_entries`: `id` (TEXT PK), `patient_id` (NOT NULL, FK → `patients.id`),
     `provider_id` (**nullable**, FK → `providers.id`; NULL means any provider),
     `earliest_at`, `latest_at`, `status`, `created_at`.
     Status values: `active | offered | booked | removed`.
   - `slot_offers`: `id` (TEXT PK), `entry_id` (NOT NULL, FK → `waitlist_entries.id`),
     `slot_id` (NOT NULL, FK → `slots.id`), `status`, `expires_at`, `created_at`.
     Status values: `pending | accepted | declined | expired`.
2. Foreign keys are declared and enforced: inserting a row that references a missing
   patient, provider, entry or slot fails.
3. The migration is applied by the existing runner (`runMigrations`). Running the
   runner again applies nothing.
4. All existing tests still pass.
5. `api/test/migrate.test.ts` covers the new migration on a fresh database: the tables
   and columns exist, FKs are enforced, and a re-run is a no-op.

### Hidden tests

`http/t1-schema.test.ts` opens the running server's SQLite file (`DATABASE_PATH`)
read-only and inspects `PRAGMA table_info` and `PRAGMA foreign_key_list`.

---

## T2. Join and leave the waitlist (API)

**Depends on:** T1

### Description

Patients can join a waitlist for one provider, or for any provider, within a time
window. They can list their entries and leave.

### API contract

| Request                                                             | Success                                         | Errors                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /waitlist` `{ patientId, providerId?, earliestAt, latestAt }` | **201** `WaitlistEntry` with `status: "active"` | 400 `VALIDATION_ERROR` · 404 `NOT_FOUND` · 409 `DUPLICATE_ENTRY`                 |
| `GET /waitlist?patientId=`                                          | **200** `WaitlistEntry[]`                       | 400 `VALIDATION_ERROR` (missing `patientId`) · 404 `NOT_FOUND` (unknown patient) |
| `DELETE /waitlist/:id`                                              | **204**, empty body                             | 404 `NOT_FOUND` · 409 `ENTRY_BOOKED`                                             |

### Acceptance criteria

1. `POST /waitlist` creates an entry with `status: "active"` and returns it with
   `id`, `patientId`, `providerId` (`null` when omitted or `null`), `earliestAt`,
   `latestAt`, `status` and `createdAt` (the Clock's now).
2. `400 VALIDATION_ERROR` when `patientId`, `earliestAt` or `latestAt` is missing, a
   timestamp is not a UTC ISO string, `latestAt <= earliestAt`, or the window is in
   the past (`latestAt <= now`).
3. `404 NOT_FOUND` when `patientId` or a non-null `providerId` does not exist.
4. `409 DUPLICATE_ENTRY` when the patient already has an `active` or `offered` entry
   for the same provider (both `null` counts as the same) whose window overlaps the
   new one. Windows overlap when `a.earliestAt < b.latestAt` and
   `b.earliestAt < a.latestAt`. A non-overlapping window, or a different provider,
   is allowed.
5. `GET /waitlist?patientId=` returns that patient's entries except `removed` ones,
   oldest first (`createdAt` ascending).
6. `DELETE /waitlist/:id` sets the entry to `removed` and returns 204. Deleting a
   `removed` or unknown entry returns `404 NOT_FOUND`. Deleting a `booked` entry
   returns `409 ENTRY_BOOKED` and changes nothing.
7. Service and HTTP tests cover each rule above.

---

## T3. Offer engine

**Depends on:** T1, T2

### Description

When an appointment is cancelled, offer the freed slot to the next eligible patient on
the waitlist.

### API contract

| Request                                    | Success                                      | Errors                                       |
| ------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| `POST /appointments/:id/cancel` (existing) | **200**, unchanged response                  | unchanged                                    |
| `GET /offers?patientId=`                   | **200** `SlotOffer[]`, only `pending` offers | 400 `VALIDATION_ERROR` (missing `patientId`) |

### Acceptance criteria

1. `appointmentService.cancel` triggers the offer engine after a successful
   cancellation. The cancellation response and behaviour are otherwise unchanged.
2. The engine picks the **next eligible** `active` entry. An entry is eligible when its
   provider matches the slot's provider (or the entry is any-provider) and the slot's
   start falls inside the entry's window.
3. For that entry it creates a `pending` offer with `expiresAt = now + TTL` (default
   15 minutes, `OFFER_TTL_MINUTES`) and sets the entry's status to `offered`.
4. While an offer is pending, the slot is held. It is not returned by
   `GET /providers/:id/slots?available=true`, and `POST /appointments` for it returns
   `409 SLOT_UNAVAILABLE`.
5. If no entry is eligible, nothing else happens and the slot stays `open` (bookable as
   before).
6. A failure inside the engine must not roll back or fail the cancellation. The
   cancellation still returns 200 and the appointment is `cancelled`.
7. `GET /offers?patientId=` returns that patient's `pending` offers.
8. Unit tests cover eligibility (provider match, any-provider, window edges), the no-match
   case, and engine-failure isolation.

---

## T4. Accept and decline offers

**Depends on:** T3

### API contract

| Request                         | Success                                                             | Errors                                                          |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `POST /offers/:id/accept`       | **200** the new appointment (same shape as `GET /appointments/:id`) | 404 `NOT_FOUND` · 409 `OFFER_NOT_PENDING` · 410 `OFFER_EXPIRED` |
| `POST /offers/:id/decline`      | **200** the `SlotOffer` with `status: "declined"`                   | 404 `NOT_FOUND` · 409 `OFFER_NOT_PENDING` · 410 `OFFER_EXPIRED` |
| `POST /staff/offers/expire-due` | **200** `{ "expiredCount": number }`                                | none                                                            |

### Acceptance criteria

1. **Accept** books the offered slot for the entry's patient (`status: "booked"`). The
   entry becomes `booked` and the offer becomes `accepted`. The appointment appears in
   `GET /appointments?patientId=`.
2. **Decline** sets the offer to `declined` and returns the entry to `active`. The
   engine immediately offers the slot to the next eligible entry. An entry is never
   offered the same slot twice. If no one is eligible, the slot becomes open again.
3. Deleting an `offered` entry (T2's `DELETE /waitlist/:id`) declines its pending offer
   the same way.
4. Accepting or declining an offer whose `expiresAt` has passed, per the Clock, returns
   `410 OFFER_EXPIRED`. Acting on an offer that is already `accepted` or `declined`
   returns `409 OFFER_NOT_PENDING`.
5. Double accept, sequential or concurrent, results in exactly one appointment.
   Concurrent calls get exactly one 200; the rest get 409 (or 410 if it has expired).
6. **Expiry** is evaluated lazily, using the Clock, whenever an offer is read or acted
   on. `POST /staff/offers/expire-due` also expires every due offer and returns how many
   it expired. When an offer expires, its status becomes `expired`, its entry returns
   to `active`, and the slot cascades to the next eligible entry (new offer with
   `expiresAt = now + TTL`), or reopens if there is none.
7. `POST /staff/offers/expire-due` is a test/ops hook. It is mounted always, not only
   when dev routes are enabled.
8. Tests use a controllable Clock to cover expiry and cascade.

---

## T5. Patient waitlist UI

**Depends on:** T2, T4

### Description

A `/waitlist` page where the patient currently selected in the header
(`current-patient-select`) can join the waitlist, see their entries and respond to
offers.

### Acceptance criteria

1. Route `/waitlist`, plus a nav link `data-testid="nav-waitlist"`.
2. Join form `waitlist-form` containing:
   - `waitlist-provider-select`: a `<select>`. Option value `""` = "Any provider";
     otherwise the value is the provider id.
   - `waitlist-earliest`, `waitlist-latest`: `<input type="date">`. The earliest date is
     sent as `<date>T00:00:00.000Z` and the latest as `<date>T23:59:59.999Z`.
   - `waitlist-submit`.
3. Validation errors (client-side or from the API) appear inline inside the form in an
   element `waitlist-error`, and no entry is created.
4. Each of the patient's entries renders in a `waitlist-entry` element containing:
   - `waitlist-status`: text equal to the entry's status (`active`, `offered`,
     `booked`).
   - `waitlist-leave`: a button for `active`/`offered` entries that leaves the
     waitlist. The entry then disappears from the list.
5. Each pending offer renders an `offer-card` with the slot's provider name and start
   time, an `offer-countdown` showing the time remaining as `M:SS` (e.g. `14:59`),
   and buttons `offer-accept` and `offer-decline`.
6. Accepting updates the entry's `waitlist-status` to `booked` and removes the
   `offer-card` without a page reload. Declining removes the `offer-card` and the
   status goes back to `active`.
7. Component tests cover the form, inline validation, and accept/decline.

---

## T6. Staff waitlist UI and manual offers

**Depends on:** T3

### API contract

| Request                                             | Success                                                                                                                       | Errors                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /staff/waitlist?providerId=` (filter optional) | **200** `WaitlistEntry[]` (not `removed`), oldest first, each with `patientName` and `providerName` (`null` for any provider) | 404 `NOT_FOUND` (unknown provider)                                                             |
| `POST /staff/offers` `{ entryId, slotId }`          | **201** `SlotOffer` (`pending`, `expiresAt = now + TTL`)                                                                      | 404 `NOT_FOUND` · 409 `SLOT_NOT_OPEN` · 409 `ENTRY_HAS_PENDING_OFFER` · 409 `ENTRY_NOT_ACTIVE` |

### Acceptance criteria

1. Route `/staff/waitlist`, plus a nav link `data-testid="nav-staff-waitlist"`.
2. `staff-waitlist-table` contains one `staff-waitlist-row` per non-removed entry. Each
   row shows the patient name, provider name (or "Any provider"), status, and wait
   time (time since `createdAt`, e.g. `2h 5m`).
3. Each row for an `active` entry has a `staff-offer-button`. Clicking it shows
   `staff-offer-slot-select` (a `<select>` whose option values are slot ids, listing open
   slots for the entry's provider, or all providers for any-provider entries) and a
   `staff-offer-confirm` button.
4. Confirming calls `POST /staff/offers`. On success the row's status shows `offered`.
   On failure the API message appears in `staff-offer-error`.
5. Manual offers bypass ordering (and the window). The slot must still be `open`;
   otherwise `409 SLOT_NOT_OPEN`, which includes slots held by a pending offer.
6. Offering to an entry that already has a pending offer returns
   `409 ENTRY_HAS_PENDING_OFFER`. Offering to a `booked` or `removed` entry returns
   `409 ENTRY_NOT_ACTIVE`.
7. A manual offer behaves like any other offer for T4: accept, decline, expiry.

---

## T7. Notifications

**Depends on:** T3

> Notify patients in a timely manner about offers.

### Fixed contract

- Test hook (dev route, `ENABLE_DEV_ROUTES=1`): `GET /dev/notifications` → **200**
  `[{ patientId, type, sentAt, body }]`, the messages sent by the stub notifier, all
  strings.

---

## T8. Audit log

**Depends on:** T2, T3, T4

> Log what matters for waitlist activity.

### Fixed contract

- `GET /staff/audit?entityId=` → **200**
  `[{ id, entityType, entityId, action, actorId?, at }]`, where `entityId` is the id of
  the waitlist entry or offer the event concerns and `at` is a UTC ISO timestamp.
