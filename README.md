# Clinic Scheduler

A small clinic appointment scheduler. Front-desk staff pick the patient they are acting
for, browse providers' open slots, book appointments and cancel them. Staff can publish
new slots and view a provider's schedule.

- **API** — Node + Express + TypeScript, SQLite via `better-sqlite3` (`/api`)
- **Web** — React + Vite + TypeScript (`/web`)
- **Tests** — Vitest (API and web), Playwright smoke test (`/e2e`)

No external services are needed: the database is a local SQLite file.

## Setup

Requires Node 20+ (see `.nvmrc`).

```sh
npm ci            # install all workspaces
npm run seed      # create api/data/clinic.db with demo data
npm run dev       # API on :3000, web on :5173 (proxies /api to the API)
```

Open http://localhost:5173 and pick a patient in the "Acting as" menu.

## Scripts

Run from the repository root.

| Script              | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | API (`tsx watch`) and web (Vite) together                           |
| `npm run seed`      | Reset the dev database and load demo data (dates relative to today) |
| `npm run ci`        | Lint + format check, typecheck, unit tests (with coverage), build   |
| `npm run lint`      | ESLint and `prettier --check`                                       |
| `npm run format`    | Apply Prettier                                                      |
| `npm run typecheck` | `tsc --noEmit` for both workspaces                                  |
| `npm test`          | Vitest for both workspaces; API enforces 80% coverage on services   |
| `npm run build`     | Compile the API to `api/dist`, bundle the web app to `web/dist`     |
| `npm start`         | Run the built API, which also serves `web/dist` on the same port    |
| `npm run e2e`       | Build, then run the Playwright smoke test against a throwaway DB    |

### Environment variables (API)

| Variable            | Default              | Purpose                                        |
| ------------------- | -------------------- | ---------------------------------------------- |
| `PORT`              | `3000`               | HTTP port                                      |
| `DATABASE_PATH`     | `api/data/clinic.db` | SQLite file (created on startup)               |
| `ENABLE_DEV_ROUTES` | unset                | `1` mounts the `/api/dev/*` test hooks         |
| `WEB_DIST_PATH`     | `web/dist`           | Built web app to serve as static files, if any |
| `OFFER_TTL_MINUTES` | `15`                 | How long a waitlist offer stays pending        |

## Architecture

```
api/
  migrations/         plain SQL, applied in filename order on startup
  src/
    index.ts          process entry: config, DB, migrations, listen
    app.ts            createApp(): mounts routers under /api, error handling
    container.ts      composition root: builds repositories and services
    routes/           HTTP only: parse params/query, call a service, send JSON
    services/         business rules and validation; throw AppError
    repositories/     SQL only; map snake_case rows to camelCase domain objects
    domain/types.ts   shared domain types
    lib/              clock, errors, ids, time, input validation helpers
    db/               open, migrate, reset, seed
  test/               Vitest: service tests on in-memory SQLite, HTTP tests via supertest
web/
  src/
    api/              typed fetch client (client.ts) and API types
    pages/            one component per route (+ *.test.tsx)
    components/       shared UI (Layout, ErrorBanner)
    context/          CurrentPatientContext: the patient being acted for
    hooks/            useApiData: load/reload API data
e2e/                  Playwright smoke test
```

Requests flow **routes → services → repositories**. Routes never touch SQL;
repositories never enforce business rules. Time comes from an injected `Clock`
(`api/src/lib/clock.ts`), so time-dependent behaviour is tested with a frozen clock.

### Domain

- **Patient** — name, unique email, optional phone.
- **Provider** — name and specialty.
- **Slot** — a provider's bookable time range; `status` is `open` or `booked`.
- **Appointment** — a patient's booking of a slot; `status` is `booked` or `cancelled`.
  Cancelling reopens the slot. All cancellation goes through `AppointmentService.cancel`.
- **Waitlist entry** — a patient waiting for a provider (or any provider) within a window;
  `status` is `active`, `offered`, `booked` or `removed`.
- **Slot offer** — a freed slot offered to a waitlist entry; `pending`, `accepted`,
  `declined` or `expired`. After a cancellation the offer engine offers the slot to the
  oldest eligible active entry; while an offer is pending the slot's status is `held`.
  Declined or expired offers cascade to the next entry, or the slot reopens.

### API

All paths are under `/api`. Success responses are the resource (or an array of
resources) as JSON. Errors are always `{ "error": { "code": "...", "message": "..." } }`.

| Method & path                   | Success | Notes                                                                                        |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `GET /health`                   | 200     |                                                                                              |
| `GET /patients`                 | 200     |                                                                                              |
| `POST /patients`                | 201     | `{ name, email, phone? }` · 409 `EMAIL_TAKEN`                                                |
| `GET /patients/:id`             | 200     |                                                                                              |
| `GET /providers`                | 200     |                                                                                              |
| `GET /providers/:id`            | 200     |                                                                                              |
| `GET /providers/:id/slots`      | 200     | `?from=&to=` (ISO, default next 14 days) · `?available=true`                                 |
| `POST /staff/slots`             | 201     | `{ providerId, startsAt, durationMinutes? }` · 409 `SLOT_OVERLAP`                            |
| `GET /appointments`             | 200     | `?patientId=&providerId=&status=`                                                            |
| `POST /appointments`            | 201     | `{ patientId, slotId, reason? }` · 409 `SLOT_UNAVAILABLE` · 422 `OUTSIDE_BOOKING_WINDOW`     |
| `GET /appointments/:id`         | 200     |                                                                                              |
| `POST /appointments/:id/cancel` | 200     | `{ reason? }` · 409 `ALREADY_CANCELLED` · 422 `APPOINTMENT_STARTED`                          |
| `POST /waitlist`                | 201     | `{ patientId, providerId?, earliestAt, latestAt }` · 409 `DUPLICATE_ENTRY`                   |
| `GET /waitlist`                 | 200     | `?patientId=` (required); excludes removed entries                                           |
| `DELETE /waitlist/:id`          | 204     | Declines a pending offer · 409 `ENTRY_BOOKED`                                                |
| `GET /offers`                   | 200     | `?patientId=` (required); pending offers with slot details                                   |
| `POST /offers/:id/accept`       | 200     | Returns the appointment · 409 `OFFER_NOT_PENDING` · 410 `OFFER_EXPIRED`                      |
| `POST /offers/:id/decline`      | 200     | Returns the offer · 409 `OFFER_NOT_PENDING` · 410 `OFFER_EXPIRED`                            |
| `GET /staff/waitlist`           | 200     | `?providerId=`; entries with `patientName`, `providerName`                                   |
| `POST /staff/offers`            | 201     | `{ entryId, slotId }` · 409 `SLOT_NOT_OPEN` / `ENTRY_HAS_PENDING_OFFER` / `ENTRY_NOT_ACTIVE` |
| `POST /staff/offers/expire-due` | 200     | `{ expiredCount }`; expires due offers (always mounted)                                      |
| `GET /staff/audit`              | 200     | `?entityId=` (required); append-only audit events for an entry or offer                      |

Every endpoint can also return 400 `VALIDATION_ERROR` and 404 `NOT_FOUND`; unknown
paths return 404 `ROUTE_NOT_FOUND`.

### Dev routes (test hooks)

With `ENABLE_DEV_ROUTES=1` the API mounts test hooks under `/api/dev`. They exist so
automated tests can get a known state and control time. They are not product features.

| Method & path            | Body                                           | Effect                                       |
| ------------------------ | ---------------------------------------------- | -------------------------------------------- |
| `POST /dev/reset`        | `{ seed?: boolean }`                           | Empty every table; optionally load demo data |
| `GET /dev/clock`         |                                                | `{ now, frozen }`                            |
| `POST /dev/clock`        | `{ now: ISO \| null }` or `{ advanceMinutes }` | Freeze/unfreeze or advance the API's clock   |
| `GET /dev/notifications` |                                                | Messages sent by the stub notifier           |

See [CONVENTIONS.md](CONVENTIONS.md) for coding conventions and how-tos.
