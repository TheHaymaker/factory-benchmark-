# Scorecard: `<factory name> <version>`, run `<runId>`

> Copy this file per run. Fill it from the run log (`run-log.schema.json`), the output
> of `hidden-tests/run.sh`, and a code review of the final commit against
> `baseline-v1`. Keep the evaluator's judgement in the "Notes" columns.

|                   |                                           |
| ----------------- | ----------------------------------------- |
| Factory / version |                                           |
| Models            |                                           |
| Operator          |                                           |
| Run dates (UTC)   | `YYYY-MM-DDThh:mmZ` → `YYYY-MM-DDThh:mmZ` |
| Baseline          | `baseline-v1` @ `<sha>`                   |
| Final commit      | `<sha>`                                   |
| Run log           | `<path or link>`                          |

## 1. Summary

| Metric                                    | Value    |
| ----------------------------------------- | -------- |
| Tickets completed (of 8)                  |          |
| Hidden tests passed, HTTP                 | `/61`    |
| Hidden tests passed, E2E                  | `/12`    |
| `npm run ci` green on final commit        | yes / no |
| Wall-clock (h:mm)                         |          |
| Active time, excluding human waits (h:mm) |          |
| Tokens (input / output / cache)           |          |
| Cost (USD)                                |          |
| PRs opened / merged                       |          |
| CI runs / failures                        |          |
| Human interventions (count / minutes)     |          |
| **Overall score (§6)**                    | `/100`   |

## 2. Per-ticket results

Hidden-test columns come from `hidden-tests/results/summary.md`. Test counts
per ticket: T1 5 · T2 18 · T3 10 · T4 14 · T5 8 (E2E) · T6 7 + 3 (E2E) · T7 2 ·
T8 3 · X 2 + 1 (E2E). Count the cross-ticket rows (X) separately; they are not part of
any ticket.

| Ticket               | Status | HTTP | E2E | PRs | Wall-clock | Cost | Interventions | Review (0–5) | Notes |
| -------------------- | ------ | ---- | --- | --- | ---------- | ---- | ------------- | ------------ | ----- |
| T1 Schema            |        | /5   | —   |     |            |      |               |              |       |
| T2 Join/leave API    |        | /18  | —   |     |            |      |               |              |       |
| T3 Offer engine      |        | /10  | —   |     |            |      |               |              |       |
| T4 Accept/decline    |        | /14  | —   |     |            |      |               |              |       |
| T5 Patient UI        |        | —    | /8  |     |            |      |               |              |       |
| T6 Staff UI          |        | /7   | /3  |     |            |      |               |              |       |
| T7 Notifications ⚑   |        | /2   | —   |     |            |      |               |              |       |
| T8 Audit log ⚑       |        | /3   | —   |     |            |      |               |              |       |
| X Cross-ticket flows |        | /2   | /1  |     |            |      |               |              |       |

⚑ Intentionally vague. Also score the interpretation in §4.

**Review (0–5) rubric for each ticket:** 0 missing · 1 broken · 2 works but ignores
conventions or has no tests · 3 meets acceptance criteria with adequate tests · 4 clean,
idiomatic, well-tested · 5 also improves the surrounding code without scope creep.

## 3. Engineering quality (code review of final diff)

Score each item 0 (no), 1 (partly), 2 (yes).

| #   | Check                                                                                                    | Score | Evidence |
| --- | -------------------------------------------------------------------------------------------------------- | ----- | -------- |
| Q1  | Layering kept: routes → services → repositories; no SQL in services/routes                               |       |          |
| Q2  | Errors use `AppError` helpers and the `{error:{code,message}}` shape; codes match tickets                |       |          |
| Q3  | All "now" comes from the injected `Clock`; no `new Date()` / `Date.now()` in services                    |       |          |
| Q4  | Offer engine hooked into `appointmentService.cancel` (single place), outside the cancel transaction      |       |          |
| Q5  | Engine failure cannot roll back a cancellation, and a unit test proves it (T3 AC6)                       |       |          |
| Q6  | Accept is atomic: exactly one appointment under concurrency (transaction or conditional update)          |       |          |
| Q7  | New migration only (001 untouched); FKs declared; `migrate.test.ts` extended                             |       |          |
| Q8  | `OFFER_TTL_MINUTES` read in `config.ts` and documented                                                   |       |          |
| Q9  | Services coverage ≥ 80%; tests are meaningful (behaviour, edges, errors), not snapshot padding           |       |          |
| Q10 | `data-testid`s exactly as specified; existing test IDs unchanged                                         |       |          |
| Q11 | README API table and CONVENTIONS updated where needed                                                    |       |          |
| Q12 | Test hooks (`expire-due`, `/dev/notifications`) present, and `/dev/*` still gated by `ENABLE_DEV_ROUTES` |       |          |
| Q13 | No unrelated changes, dependency churn or disabled lint rules or tests                                   |       |          |
| Q14 | Commit/PR hygiene: one ticket per PR (or clearly scoped), descriptive messages, CI green at merge        |       |          |
|     | **Subtotal**                                                                                             | `/28` |          |

## 4. Ambiguity handling (T3 ordering, T7, T8)

Compare with the intended interpretations in `NOTES.md`.

| #   | Check                                                                                      | Score (0–2) | Evidence |
| --- | ------------------------------------------------------------------------------------------ | ----------- | -------- |
| A1  | T3: FIFO by `created_at`; the choice is stated (code comment, PR or docs)                  |             |          |
| A2  | T3/T4: never re-offers a slot to an entry that declined or let it expire                   |             |          |
| A3  | T7: `Notifier` interface + stub injected (not hard-coded calls)                            |             |          |
| A4  | T7: covers offer-created, expiring-soon and expired                                        |             |          |
| A5  | T7: failing notifier does not break the flow, and a test proves it                         |             |          |
| A6  | T8: every entry and offer state transition logged, with before/after status                |             |          |
| A7  | T8: actor recorded (patient / staff / system); append-only; same transaction as the change |             |          |
| A8  | Asked a clarifying question, or documented its assumption, rather than silently guessing   |             |          |
|     | **Subtotal**                                                                               | `/16`       |          |

## 5. Planted warts (see `NOTES.md`)

| Wart                                    | Noticed? (0–1) | Handled well? (0–2) | Evidence |
| --------------------------------------- | -------------- | ------------------- | -------- |
| W1 `parseStart` inconsistent validation |                |                     |          |
| W2 under-documented `availability.ts`   |                |                     |          |
|                                         | **`/2`**       | **`/4`**            |          |

"Handled well" for W1: new code uses `requireIsoTimestamp`, and the factory fixes or
flags `parseStart`. For W2: accept/offer behaviour around the 2-hour lead time is
deliberate and tested, and the module is documented.

## 6. Overall score

| Component                                  | Weight | Raw   | Weighted |
| ------------------------------------------ | ------ | ----- | -------- |
| Hidden tests, T1–T6 (HTTP + E2E pass rate) | 40     | `/65` |          |
| Hidden tests, T7–T8 + cross-ticket (X)     | 10     | `/8`  |          |
| Engineering quality (§3)                   | 20     | `/28` |          |
| Ambiguity handling (§4)                    | 10     | `/16` |          |
| Warts (§5)                                 | 5      | `/6`  |          |
| Autonomy: 5 − interventions (min 0), ×3    | 15     | `/15` |          |
| **Total**                                  | 100    |       |          |

Report efficiency separately; do not fold it into the score. Give cost per passed
hidden test, wall-clock per completed ticket, and tokens per merged PR.

| Efficiency                        | Value |
| --------------------------------- | ----- |
| Cost per passed hidden test (USD) |       |
| Wall-clock per completed ticket   |       |
| Tokens per merged PR              |       |

## 7. Human interventions

| When (UTC) | Ticket | Kind | Initiated by | Minutes | What happened |
| ---------- | ------ | ---- | ------------ | ------- | ------------- |
|            |        |      |              |         |               |

## 8. Evaluator notes

- Strengths:
- Weaknesses:
- Surprises / notable decisions:
- Would you merge this? Why or why not?
