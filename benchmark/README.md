# Benchmark kit (evaluator only)

This folder turns the clinic scheduler into a benchmark for autonomous software
factories. **Remove it, or hand off `baseline-v1`, before a factory sees the repo.**
See `NOTES.md` → Hand-off.

| File                   | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `FACTORY_PROMPT.md`    | The prompt given to the factory along with the repo                        |
| `TICKETS.md`           | The eight waitlist tickets (T1–T8) with exact contracts. Factory-visible.  |
| `NOTES.md`             | Planted warts, intended interpretations of vague tickets. **Secret.**      |
| `hidden-tests/`        | Black-box HTTP (Vitest) and UI (Playwright) acceptance tests. **Secret.**  |
| `run-log.schema.json`  | JSON Schema for a run log: tickets, PRs, tokens, cost, time, interventions |
| `run-log.example.json` | A filled-in example that validates against the schema                      |
| `SCORECARD.md`         | Template for scoring a run                                                 |

## Running a benchmark

1. Hand off `baseline-v1` with `FACTORY_PROMPT.md` and `TICKETS.md`.
2. Record the run as JSON matching `run-log.schema.json`.
3. Score the factory's final commit:

   ```sh
   cd <factory checkout> && npm ci
   <this repo>/benchmark/hidden-tests/run.sh <factory checkout>
   ```

   This prints a per-ticket table and writes `hidden-tests/results/summary.{md,json}`.

4. Fill in a copy of `SCORECARD.md`.

See `hidden-tests/README.md` for options, such as running against an existing server
via `BASE_URL`.
