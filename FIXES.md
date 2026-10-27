# What to fix — outcome tracker

Written 2026-10-24. Findings come from reading the code and querying `data/radar.db` directly.

**Status 2026-10-27: Fixes 1, 2 and 5 are implemented and verified. Fixes 3 and 4 are still open
and should stay open until there is real sample volume.** Two diagnoses in the original list were
wrong and are corrected in place below.

## Why this matters

The outcome tracker is the only thing in the app that measures whether the radar is right. Every
probability, target and risk/reward figure the strict filter publishes is derived from it
(`shared/verification.ts:95`). Right now it is throwing away most of its own evidence, so the app
cannot answer the one question it exists to answer.

## The numbers, as of today

Samples recorded 2026-10-11 → 2026-10-19:

| Status | Count | Share |
| --- | --- | --- |
| `untracked` (discarded) | 1,814 | 87.7% |
| `pending` (horizon not reached) | 243 | 11.8% |
| `resolved` (usable) | 11 | 0.5% |

The 11 resolved outcomes: 6 up, 3 down, 2 flat. Mean return **+9.4%**, mean peak **+43.2%**, mean
max drawdown **−3.5%**.

`verified_alerts` is **empty**. Zero strict alerts have ever been sent, because `STRICT.minComparables`
requires 20 resolved outcomes (`shared/verification.ts:35`) and there are 11.

---

## Fix 1 — Sample loss (blocker) — DONE

**Symptom:** 87.7% of samples resolve as `untracked`.

**Cause.** `resolveSamples` needs at least 3 price points between `taken_at` and the 60-minute
horizon, otherwise it discards the sample (`server/services/verification.ts:72-75`). Three separate
mechanisms remove those points before the horizon arrives:

1. **Eviction.** `evict()` runs every 60s and deletes tokens outright once more than
   `maxTokens: 300` are held, preferring inactive and low-mcap ones
   (`server/pipeline/monitor.ts:357-369`). The in-memory history goes with them.
2. **Polling drops the token.** `pickBatch` only polls tokens where `isActive` is true — pinned, or
   younger than `activeWindowMs: 6h`, or at or above `tractionMcapUsd: $12,000`
   (`server/pipeline/monitor.ts:174-190`). A sampled token that stalls under $12k competes with
   every other active token for one of `batchSize: 30` slots per tick.
3. **Persistence does not save it either.** `persist()` skips any token not updated in the last 20
   seconds (`server/pipeline/monitor.ts:329`), then prunes the `tokens` table down to `maxTokens`.
   So a token that stops being polled is not written to disk before it is dropped.

At resolve time the fallback `monitor.lookup(mint)` refetches the token, but a refetched token
starts with a single history point (`shared/tokenService.ts:107`) — nothing inside the sample
window. Path length 1, below the minimum of 3, discarded.

**Fix.** Stop relying on the monitor's live history to measure a sample. Either:

- **(preferred) Pin every pending sample.** Add its mint to `pinned` when the sample is recorded,
  release it when resolved. `pinned` already bypasses both `isActive` and `evict()`, so the token
  keeps getting polled and keeps its history for the full hour. Cost: up to a few hundred extra
  pinned tokens during busy periods — check this against `batchSize: 30` before shipping, since a
  pinned backlog larger than the batch will starve the poll cycle. If that is a problem, cap pinned
  samples and record fewer of them rather than measuring them badly.
- **or write price points to their own table.** A small `sample_prices (sample_id, t, price)` table
  appended on every poll for a pending sample. More code, but independent of monitor lifecycle and
  survives restarts.

**What was done — both halves, because either alone still loses samples:**

1. **Pinned while pending** (`server/services/userData.ts`). `refreshPinned()` now unions in
   `setup_samples WHERE status = 'pending' AND taken_at > now − (horizon + 10 min)`, so a sampled
   mint is polled for its whole horizon and is exempt from `isActive`, from `evict()` and from the
   persist cutoff. The time bound releases the pin by itself, so pending rows stranded by a restart
   (there were 243 of them) cannot pin tokens forever. `refreshPinned()` is called when a sample is
   recorded and on every resolve tick.
2. **The path is accumulated, not reconstructed** (schema v5 + `server/services/verification.ts`).
   `setup_samples` gained `points`, `last_price` and `last_at`. `trackSample()` runs on every
   transition — i.e. every poll — and updates the running `points`, `last_price`, `last_at`,
   `MAX(max_up_pct)` and `MIN(max_dd_pct)` for that mint's pending samples. `resolveSamples()` is
   now synchronous and reads those columns; it never touches `monitor.lookup` or `t.history`.

The scoring decision moved into a pure function, `resolveOutcome()` in `shared/verification.ts`, so
it is testable without a database. It refuses a sample whose readings span less than 80% of the
horizon (`MIN_HORIZON_COVERAGE`) — a setup that stopped being polled after five minutes says nothing
about a 60-minute hold, and scoring it anyway would have replaced a visible bug with an invisible
bias. Every refusal now logs a warning with its reason; previously it was silent.

**Verified.** Against a mock-mode server on a throwaway database: samples recorded, `points` and the
peak/drawdown climbing in step with elapsed time, and all pending mints returned by the pin query.
Two synthetic due samples were resolved by the live resolver:

```
INFO  [verify] outcome tracker: $WATCHED resolved +50.0% (peak 80.0%)
WARN  [verify] outcome tracker: $DROPPED not measurable — readings span 6 of 60 min
```

**Still to confirm in production:** after a day of live running, the `untracked` share should be in
the low single digits.

```sql
SELECT status, COUNT(*) FROM setup_samples
WHERE taken_at > (unixepoch() - 86400) * 1000 GROUP BY status;
```

The 243 pre-existing `pending` rows have `points = 0` and will be marked `untracked` on the first
resolve tick. That is correct — they were never measurable — but it means the lifetime `untracked`
count will rise before it stops growing. Judge the fix on rows recorded after it shipped.

---

## Fix 2 — The history window cannot span the horizon — DONE

**Correction to the original diagnosis.** It said history is capped at 200 points. That is wrong:
the in-memory cap is `MAX_HISTORY = 720` (`shared/tokenService.ts:10`). The 200-point trim is in
`compactToken`, which is used only for persistence and SSE — so it limited what survived a restart,
not what the resolver could see while running.

**The concern was still real, with different numbers.** `pushHistory` merges points less than 3
seconds apart, so 720 points is a floor of ~36 minutes for a token volatile enough to trip the
2%-move rule on every read (`shared/tokenService.ts:247`) — under the 60-minute horizon. Plus a
restart left only 200 persisted points behind.

**What was done.** Both of those disappear with Fix 1's accumulated path: the peak, drawdown and
exit are written to the sample row as readings arrive, so the measurement no longer depends on how
much history is retained anywhere, or on surviving a restart. No change to `MAX_HISTORY` or
`compactToken` was needed, and none was made.

---

## Fix 3 — The exit rule measures the wrong thing

**Symptom:** mean peak **+43.2%**, mean realised return **+9.4%**. Two examples:

| Token | Peak | Closed at |
| --- | --- | --- |
| `LUCIA` | +162.2% | −1.3% |
| `onboardinu` | +178.4% | +33.2% |

**Cause.** `resolveSamples` exits at the last price at or before the 60-minute mark
(`server/services/verification.ts:70-71`). It is measuring a fixed-clock exit, which is not a rule
anyone would actually trade. The entry screen is finding real movement; the measurement throws it
away.

**Fix.** Keep the clock exit — it is a fair baseline — and record alongside it the outcome of a
trailing rule on the same path: sell half at +50%, trail the remainder by the observed noise band.
Two extra columns (`trail_return_pct`, `trail_exit_price`). Same samples, two measured rules, no new
data collection.

**Note:** this is also the shape of trade the app already publishes. `shared/levels.ts` and
`buildPlan` (`shared/verification.ts:95`) both give TP1/TP2/TP3 plus a stop, so the tracker should
measure that, not a stopwatch.

---

## Fix 4 — Only one strategy is measured

**Symptom:** the tracker cannot compare strategies, because only one is in it.

**Cause.** By design — one sample, one exit rule.

**Fix.** Once Fix 1 lands and sample volume is real, record the same path under a small number of
named exit rules (clock / trailing / TP-ladder with stop). One row per sample per rule, or one row
with a column per rule. Keep it to three; this is measurement, not a backtesting framework.

**Do not start this before Fix 1.** Comparing rules on 11 samples produces noise with extra steps.

---

## Fix 5 — The strict filter fails silently — DONE (mostly already built)

**Correction to the original diagnosis.** It said the evidence progress needs surfacing in the UI.
It was already there: `src/components/token/StrictFilterCard.tsx` shows "N resolved · N pending", a
progress bar against `required`, and an explanation of the horizon. `/api/verification/stats` has
been serving it all along.

**What was actually missing** was the one number that would have exposed the bug: the discard count.
Nothing counted `untracked`, so 1,814 silently-dropped samples looked identical to never having run.

**What was done.** `untracked` added to `EvidenceStats` (`shared/types.ts`) and to the SQL in
`evidenceStats()`. The card now prints "N of M recorded setups could not be measured", in a warning
tone when discards outnumber resolved outcomes. Plus every individual refusal now logs its reason
(see Fix 1), so the same failure cannot be silent twice.

---

## Already working — do not rebuild

- **Deployer history is populated.** `creator_launches` holds 31,949 launches from 12,373 deployers;
  180 of those deployers account for 9,456 launches. `STRICT.maxCreatorPriorLaunches` already uses
  it as a gate. The richer signal — repeat-deployer bucket as a scored factor rather than pass/fail
  — is available for free from data already being collected.
- **Entry/exit plans exist in two places.** `shared/levels.ts` reads a token's own traded range;
  `buildPlan` in `shared/verification.ts` sizes stops and targets from past outcomes. The second is
  the better engine and is dark only because of Fix 1.
- **Position sizing is done.** `src/components/token/PositionSizeCalculator.tsx`.

---

## Order of work

1. ~~**Fix 1**~~ — done.
2. ~~**Fix 2**~~ — done, subsumed by Fix 1.
3. ~~**Fix 5**~~ — done.
4. **Run it live for two to three weeks.** This is the next step, and it is the only one.
5. **Fix 3**, then **Fix 4** — once there are hundreds of samples to compare. Not before; comparing
   exit rules on a handful of outcomes produces noise with extra steps.

## The check that was left behind — DONE

The sample-loss bug was invisible because nothing failed. `scripts/verify-test.ts` now covers
`resolveOutcome()` with eight assertions (`npm test`):

- a setup watched for its full horizon resolves, and its return is measured entry → exit
- the accumulated peak and drawdown survive the measurement
- a losing setup still resolves, so the evidence base is not biased upward by dropping losses
- the three genuine failure modes are refused and not guessed at: too few readings, a path covering
  5 of 60 minutes, no exit price
- the `LUCIA` case specifically — peaked +162.2%, closed −1.3% — keeps **both** numbers, since the
  gap between them is the entire argument for Fix 3

If someone changes the monitor's retention or polling rules again, these fail loudly instead of the
tracker quietly going dark.
