# Hidden acceptance tests

Black-box tests for tickets T1–T8, plus cross-ticket flows (X). They use only HTTP,
the browser, and (for T1) the SQLite file, so they run against any implementation
that honours the contracts in `../TICKETS.md`.

```
http/t<N>-*.test.ts    Vitest + fetch, one file per ticket (T5 has no API of its own)
http/x-*.test.ts       cross-ticket HTTP flows
e2e/t5-*.spec.ts       Playwright, patient waitlist UI
e2e/t6-*.spec.ts       Playwright, staff waitlist UI
e2e/x-*.spec.ts        cross-ticket UI flow
lib/api.ts             shared black-box helpers (reset, clock, fixtures)
run.sh                 build + start target, run both suites, summarize
summarize.mjs          per-ticket pass/total table → results/summary.{md,json}
```

This folder has its own `package.json`. It does not depend on the target's
dependencies.

## Usage

```sh
cd benchmark/hidden-tests && npm ci
./run.sh /path/to/target-checkout   # target needs `npm ci` already
```

`run.sh` runs `npm run build` and then `npm start` in the target with `PORT`
(default 3100), a fresh `DATABASE_PATH`, and `ENABLE_DEV_ROUTES=1`. Then it runs
Vitest and Playwright and prints the summary.

Against an already-running server:

```sh
SKIP_SERVER=1 BASE_URL=http://localhost:3000 DATABASE_PATH=/path/to/db ./run.sh
```

The server must have `ENABLE_DEV_ROUTES=1`. `DATABASE_PATH` is needed only for T1.
The suites reset the database, so never point them at data you care about.

## Assumptions about the target

- `npm run build && npm start` serves the API under `/api` and the web app on the same
  origin, honouring `PORT`, `DATABASE_PATH` and `ENABLE_DEV_ROUTES` (true of the
  baseline).
- `POST /api/dev/reset {seed:true}` and `POST /api/dev/clock` work as in the baseline.
  Seeded providers `prv_ruiz` (Dr. Ana Ruiz) and `prv_okafor` exist.
- Every test freezes the server clock at `2030-01-07T08:00:00.000Z`. UI specs also
  install the browser clock (`page.clock`) at the same instant, so countdowns and wait
  times are deterministic.

## Baseline check

Against `baseline-v1`, every hidden test fails, for the expected reason:
`ROUTE_NOT_FOUND` for the new endpoints, missing tables for T1, and missing
`data-testid`s for the UI.

| Ticket | HTTP | E2E |
| ------ | ---- | --- |
| T1     | 0/5  | —   |
| T2     | 0/18 | —   |
| T3     | 0/10 | —   |
| T4     | 0/14 | —   |
| T5     | —    | 0/8 |
| T6     | 0/7  | 0/3 |
| T7     | 0/2  | —   |
| T8     | 0/3  | —   |
| X      | 0/2  | 0/1 |
