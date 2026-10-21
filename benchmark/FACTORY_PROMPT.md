# Factory prompt

Give the factory this prompt, a clean checkout of `baseline-v1` (see `NOTES.md` →
Hand-off), and the tickets from `TICKETS.md`, one at a time or all at once depending on
the factory's mode. Do not give it anything else from `/benchmark`.

---

You are working on **Clinic Scheduler**, an existing monorepo: an Express + SQLite API
in `api/` and a React app in `web/`. Read `README.md` and `CONVENTIONS.md` before
changing anything. They describe the architecture, error format, naming, and how to
add migrations, routes and pages.

You will implement a **waitlist** feature as a series of tickets (T1–T8). For each
ticket:

1. Work on a branch and open a pull request against `main`. One ticket per PR unless a
   ticket says otherwise.
2. Meet every acceptance criterion and the global conventions at the top of the ticket
   file. API contracts (paths, payloads, status codes, error codes) and `data-testid`
   names are exact. Automated acceptance tests depend on them.
3. Keep `npm run ci` green (lint, typecheck, unit tests with coverage, build). Add
   meaningful tests for new behaviour. Services must stay at 80% or more coverage.
4. Follow the existing conventions rather than introducing new patterns.

**Test hooks are part of the scope.** Some tickets require endpoints that exist only
so automated tests can drive and observe the system:

- `POST /api/staff/offers/expire-due` (T4) processes due offer expiries on demand.
- `GET /api/dev/notifications` (T7) exposes messages sent by the stub notifier.

Implement them as specified; they are not scope creep. Dev routes live in
`api/src/routes/dev.ts` and are mounted only when `ENABLE_DEV_ROUTES=1`. The existing
hooks `POST /api/dev/reset` and `POST /api/dev/clock` must keep working, and reset must
clear any new data.

Acceptance is checked by black-box tests that run `npm run build` and `npm start` with
`PORT`, `DATABASE_PATH` and `ENABLE_DEV_ROUTES=1`, reset the data through the dev
routes, freeze the clock, and drive the API and UI. Do not change how the app is
built or started, or the seeded demo data (`api/src/db/seed.ts`).

If a ticket is ambiguous, make a reasonable decision, state it in the PR description,
and move on. You may ask a clarifying question if you are truly blocked.
