# Benchmark notes (evaluator only)

**Do not give this file, or anything else in `/benchmark`, to a factory.** It lists the
planted warts and the intended interpretation of underspecified tickets.

## Hand-off

The tag `baseline-v1` is the hand-off point. No commit up to that tag contains
`/benchmark`, so a factory can receive a clean repository with:

```sh
git clone --branch baseline-v1 --single-branch <repo> factory-repo
cd factory-repo && git checkout -b main && git tag -d baseline-v1   # optional
```

or `git archive baseline-v1 | tar -x -C factory-repo` for a history-free copy. Never
hand over a clone of `main`, which contains `/benchmark` and these notes.

## Planted warts

Two realistic, mild warts. A strong factory notices and handles them, and ideally
leaves the code better. Neither is mentioned in the README or CONVENTIONS.

### W1. Inconsistent timestamp helper: `SlotService.create` (`parseStart`)

`api/src/services/slotService.ts` has a private `parseStart()` that validates
`startsAt` with `new Date(value)`. Everywhere else, timestamp input goes through
`requireIsoTimestamp()` / `parseIsoUtc()` from `lib/validate.ts` and `lib/time.ts`,
which accept only UTC ISO strings ending in `Z`. As a result, `POST /api/staff/slots`
accepts `2030-01-08`, `2030-01-08T09:00:00+02:00` or even `Jan 8 2030 09:00`, while
the rest of the API rejects them. Values are normalized with `toIso()` before storage,
so stored data stays clean. It is an inconsistency, not data corruption.

What to look for:

- Does the factory copy `parseStart` when validating `earliestAt` / `latestAt` (bad),
  or use `requireIsoTimestamp` (good)? T2 requires rejecting non-ISO timestamps, so a
  copied `parseStart` fails `t2 › rejects non-ISO timestamp` only if the factory also
  forgets other checks. Mostly this is a code-review signal.
- Bonus: fixing `parseStart` to use the shared helper, with a test, without being asked.
  Count it as a positive only if behaviour for valid ISO input is unchanged.

### W2. Under-documented module: `api/src/services/availability.ts`

`isBookable(slot, now)` has no doc comments and terse constant names (`LEAD_MIN = 120`,
`HORIZON_D = 60`). It encodes two booking rules that appear nowhere in the docs: a
**2-hour minimum lead time** and a **60-day maximum horizon**. The only outside clue is
the `OUTSIDE_BOOKING_WINDOW` error code in the README.

Why it matters for the waitlist:

- If the factory implements **accept** by calling `appointmentService.book()`, accepting
  an offer for a slot that starts in less than 2 hours fails with 422. The tickets do
  not say what should happen. **Intended:** offers are a commitment, so accept books
  directly, and the engine does not offer slots that start within the lead time. A
  late cancellation more than 2 hours ahead is still offered.
- If the factory holds slots by adding a status (`'held'`), `isBookable`'s
  `status !== 'open'` check hides held slots from `?available=true` for free. Factories
  that read the module notice this; others re-implement the filter.
- The hidden tests deliberately use slots more than 2 hours and less than 60 days from
  the frozen clock, so W2 never decides a hidden test. It shows up in code review and
  in factory-written tests.

Bonus: documenting `availability.ts`, naming the constants, and noting the rules in
CONVENTIONS/README.

## Intended interpretations

### T3: "next eligible" ordering

The ticket leaves ordering underspecified. **Intended: FIFO by `created_at`** of the
entry, with ties broken by insertion order or id. Specific-provider and any-provider
entries share a single queue; specificity gives no priority. Hidden tests assert
ordering only where creation times differ by at least one minute on the frozen clock.

The competing reading is **urgency** (triage priority, earliest deadline, or narrowest
window first). Nothing in the schema supports urgency: T1 has no priority column. A
factory that wants it must either ask or invent a field. This is the probe for
"asks or guesses":

- Best: asks, or picks FIFO and states the choice explicitly (PR description or code
  comment). Score A1 and A8 in full.
- Acceptable: picks FIFO silently. Score A1 in full, A8 zero.
- Poor: invents an urgency/priority field or ordering without asking. Even if hidden
  tests still pass (they create entries with no urgency), score A1 zero and flag scope
  creep in Q13.

Other points T3 leaves open, with the intended answer. None is hidden-tested.

- The patient who cancelled should not be offered their own slot. Skip their entries.
- Slots starting within the 2-hour lead time (see W2) are not offered.
- When the same patient has several eligible entries, offer to the oldest one only.
- An entry has at most one pending offer at a time. Since `offered` entries are not
  `active`, this follows naturally.

### T4: decline, expiry and re-offers

The ticket says "an entry is never offered the same slot twice". **Intended:** the
engine excludes entries that have a declined or expired offer for the slot. A simple
"exclude the entry that just declined" passes the hidden tests but fails the expiry
cascade when two or more entries have lapsed. `x-cross-ticket › expiry flow` covers
this.

### T7: Notifications ("Notify patients in a timely manner about offers")

**Intended:**

- A `Notifier` interface (`notify(patientId, type, body)`) injected into the offer
  service, with an in-memory `StubNotifier` that records messages and backs
  `GET /api/dev/notifications`. `POST /api/dev/reset` clears it.
- Notifications for:
  - `offer_created`: tells the patient which slot is offered and when the offer expires.
  - `offer_expiring_soon`: sent when an offer is near expiry, for example 5 minutes
    before (`expire-due` or a lazy check can send it). Each offer gets it once.
  - `offer_expired`: tells the patient they missed it.
  - Optional: `offer_accepted` confirmation.
- "Timely" means sent at the moment of the transition, using the Clock for `sentAt`.
  No background jobs are needed, but a factory that adds an interval-based sweeper
  behind config is a reasonable reading.
- A failing `notify()` is caught and logged. It never fails or rolls back the offer
  flow. Unit tests should prove this with a throwing notifier.

Hidden tests assert only that at least one notification exists for the offered patient
after an offer is created. Score the rest in review (see SCORECARD).

### T8: Audit log ("Log what matters for waitlist activity")

**Intended:**

- An append-only `audit_events` table: `id`, `entity_type` (`waitlist_entry` |
  `slot_offer`), `entity_id`, `action`, `from_status`, `to_status`, `actor_type`
  (`patient` | `staff` | `system`), `actor_id`, `at`. Written through a single service
  or repository with no update or delete path.
- Every state transition for entries and offers: join, leave/remove, offered, booked,
  offer created, accepted, declined, expired, manual staff offer. Each event records
  before and after status and the actor. Expiry is `system`; staff manual offer is
  `staff`; patient actions are `patient`, with `actorId` = patientId.
- Audit writes happen in the same transaction as the state change they describe.
- `GET /api/staff/audit?entityId=` returns events oldest first.

Hidden tests assert only that join, offer-created and accept each produce at least one
event against the right entity: entry for join, offer for creation and acceptance.

## Hidden-test design notes

- Hidden tests run against a fresh database, with `ENABLE_DEV_ROUTES=1` and the clock
  frozen at `2030-01-07T08:00:00.000Z` (`POST /api/dev/clock`). Each test calls
  `POST /api/dev/reset {seed:true}` and creates its own patients and slots, so tests
  do not depend on one another.
- Tests reuse the seeded provider ids `prv_ruiz` and `prv_okafor`. A factory that
  changes the seed ids breaks the hidden tests. That is an acceptable signal, because
  seed data is part of the baseline.
- Every test fails on `baseline-v1`. The run log for that check is in the repo at
  `hidden-tests/README.md` → "Baseline check".
- Playwright specs exist only for tickets with UI (T5, T6) plus one cross-ticket UI
  flow. T1–T4, T7 and T8 are API- or schema-only, so their black-box coverage is the
  HTTP suite. The T1 suite inspects the SQLite file directly (`DATABASE_PATH`) because
  a schema has no HTTP surface.
- T3 AC 6 (engine failure must not roll back the cancel) is not black-box testable
  without fault injection. Check it in review and through the factory's own unit tests.
