# lifeOS — Scoring Engine (implementation spec)

---

## 0. The one architectural rule

**LLM work happens at ingest. Recalculation is pure, deterministic, and unit-testable.**

- The LLM lives only at the **edges**: parsing manual progress inputs into structured rows (§3.1), authoring goal drafts during a planning session (`lifeOS-planning-sessions.md` §5.1), and phrasing explanations/reports into words. All three write or narrate *structured* data — none runs inside the math.
- **`recalculate(date)`** is a pure function of current DB state → a `scores` row. **No LLM calls, no randomness.** Same inputs/goals ⇒ same score, every time.
- Narration (the score explanation, the quarter report) runs only *after* the numbers are computed, never inside them.

Quarantining the LLM to ingest is what makes the number reproducible and trustworthy. Do not call the model from inside the math.

**Build order:** get Stages 1–2 right for a single `metric` goal against real data first. Prove one honest pace gap before adding aggregation, alignment, smoothing, or any LLM call.

---

## 1. Data the engine reads

Operates on the existing schema plus these required deltas:

- `goals`: add `paceShape: enum(linear|easeIn|easeOut|sCurve)` and `paceParam: real?` (the `k`); `weight: real default 1`; `startDate`, `endDate` (or derive from `quarter`); for `consistency` goals, `cadencePerWeek: real`; for `metric` goals, a way to read `currentValue` (latest authoritative input value, or a denormalised column).
- `inputs`: add `value: real?` (observed metric reading, distinct from progress), `durationMin: real?` (for alignment), and widen `progressDelta` to **−1..1**.
- `scores`: add `operatingLevelRaw: real`, `alignment: real`, `contributors: json` (ranked decomposition).

**Goal lifecycle:** ✅ `goals.active: boolean` has been migrated to `goals.status: enum(draft|proposed|active|completed|abandoned)`, owned by `lifeOS-planning-sessions.md`. **Only goals with `status = active` are scored** — `draft`, `proposed`, `completed`, and `abandoned` goals are excluded from every stage. An `abandoned` goal drops out from its abandonment date forward and is never retro-penalised.

Everything else in the draft model stands.

---

## 2. The algorithm

All quantities below are computed `asOf` a given date.

Let **`τ` = fraction of the goal's window elapsed** = `clamp((asOf − startDate) / (endDate − startDate), 0, 1)`.

### Stage 1 — Completion `c ∈ [0,1]`, by goal `type`

```
metric:       c = clamp((currentValue − startValue) / (targetValue − startValue), 0, 1)
consistency:  c = completedPeriods / scheduledPeriods       // scheduledPeriods from cadence × elapsed
milestone:    c = clamp(Σ_i (δ_i · confidence_i), 0, 1)      // δ_i = per-input progressDelta, each capped at MAX_INPUT_DELTA
```

Only `milestone` uses LLM-derived `δ`. `metric` and `consistency` are computed from real values/occurrences — the LLM must never produce `c` for them.

### Stage 2 — Expected pace `e ∈ [0,1]` and goal gap

```
linear:   e = τ
easeIn:   e = τ ^ k                  // back-loaded (compounding savings, momentum)
easeOut:  e = 1 − (1 − τ) ^ k        // front-loaded (skills that plateau)
sCurve:   e = 1 / (1 + exp(−k·(τ − 0.5)))   // normalise so e(0)=0, e(1)=1 if desired

goalGap  γ = c − e        // ∈ [−1, 1]; positive = ahead, negative = behind
```

Default `paceShape = linear`. Only deviate deliberately.

### Stage 3 — Vector gap `Γ_v`

```
Γ_v = ( Σ_g weight_g · γ_g ) / ( Σ_g weight_g )      // over status=active goals in the vector
```

Then a gentle **staleness** decay, applied only to vectors whose contributing goals are `metric`/`milestone` (consistency self-registers neglect):

```
daysStale  = asOf − lastInputDate(vector)
staleness  = STALE_RATE · max(0, daysStale − STALE_GRACE)     // small, bounded
Γ_v       -= min(staleness, STALE_CAP)
```

A vector with **no active goal** is excluded from the composite (renormalise weights); surface it as a prompt, never a number.

### Stage 4 — Alignment penalty

Over a trailing `ALIGN_WINDOW_DAYS` window, sum effort (use `durationMin`; fall back to input counts):

```
aligned    = effort where vectorId or goalId is set
unaligned  = effort where both are null (untagged calendar/inputs)
a          = aligned / (aligned + unaligned)        // = 1 if no effort logged
p          = ALIGN_LAMBDA · (1 − a)                 // bounded penalty; rest is not punished
```

### Stage 5 — Composite → 0..100

```
G = ( Σ_v W_v · Γ_v ) / ( Σ_v W_v )  −  p           // W_v = vector weight, default uniform

if G ≥ 0:  S = ON_PACE_SCORE + (100 − ON_PACE_SCORE) · G
else:      S = ON_PACE_SCORE + ON_PACE_SCORE · G
S = clamp(S, 0, 100)
```

On-pace (`G = 0`) anchors at `ON_PACE_SCORE` (70), ahead climbs to 100, behind falls to 0. **On-pace must never be 100** — that turns the number into a guilt machine. Simpler linear fallback if preferred: `S = 50 + 50·G`.

### Stage 6 — Smoothing

```
OL_today = α · S + (1 − α) · OL_previous      // EMA; OL_previous = last persisted operatingLevel
```

Persist both `operatingLevelRaw = S` and `operatingLevel = OL_today`.

### Stage 7 — Explanation (numbers from code, words from LLM)

Code ranks contributors by `|W_v · Γ_v|`, attaches each one's dominant goal with `c` vs `e`, flags alignment if `p` materially moved `S`, and writes `contributors` json. The LLM only turns that into one sentence (see §3.2).

---

## 3. LLM contracts

### 3.1 Extract (ingest, manual inputs only)

**Purpose:** tag free text to a vector/goal and emit *structured* signals. It must NOT compute `c`, `γ`, or the score.

**Input:** the input `rawText`, plus the list of active goals `[{id, vectorId, type, description}]`.

**Output (strict JSON, low temperature):**

```json
{
  "entries": [
    {
      "goalId": "string | null",
      "vectorId": "string | null",
      "kind": "milestone_delta | metric_value | consistency_occurrence | untagged",
      "progressDelta": "number | null",   // only for milestone_delta, −1..1
      "value": "number | null",           // only for metric_value (the observed number)
      "occurredCount": "number | null",   // only for consistency_occurrence (usually 1)
      "confidence": "number"              // 0..1
    }
  ]
}
```

Rules: `kind` follows the matched goal's `type`. For `metric` goals report the observed `value`; for `consistency` report `occurredCount`; for `milestone` report `progressDelta`. If nothing matches a goal but it implies effort, emit `kind: "untagged"` (feeds the unaligned bucket). Never emit `progressDelta` for non-milestone goals.

**Scope:** this contract is **progress logging only** — tagging effort/values to *existing* `status = active` goals. Creating new vectors/anchors/goals during a planning session uses the separate **session-authoring output** in `lifeOS-planning-sessions.md` §5.1; do not author goals through this contract.

### 3.2 Phrase (after recalculation)

**Input:** `operatingLevel` + the ranked `contributors`.
**Output:** one plain sentence, sentence case, no hype, ≤ ~15 words. Example: `"68 — Craft sits at 20% vs 55% expected, no input in 9 days."`

---

## 4. Constants (single config module)

```
ON_PACE_SCORE      = 70      // anchor for "on pace"
EMA_ALPHA          = 0.3     // smoothing (~1 week memory)
ALIGN_LAMBDA       = 0.15    // max alignment penalty
ALIGN_WINDOW_DAYS  = 14
STALE_GRACE        = 5       // days before staleness bites
STALE_RATE         = 0.01    // per day beyond grace
STALE_CAP          = 0.15    // max staleness drag per vector
MAX_INPUT_DELTA    = 0.34    // no single milestone input exceeds this
CONFIDENCE_FLOOR   = 0.2     // inputs below this are ignored
```

These are feel-dials — calibrate by use, not by editing logic.

---

## 5. Edge cases (explicit rules)

- **New user / insufficient data** → return a `calibrating` state, not a number. Never fabricate a starting score.
- **Empty vector** → exclude from composite, renormalise; surface "add a goal."
- **Regression** → metric `c` falls naturally; manual milestone `δ` may be negative (hence −1..1).
- **Stale metric value** → staleness decay + a "needs update" flag; don't blindly trust an old reading.
- **Gaming** → metric/consistency are objective; milestone is capped per-input (`MAX_INPUT_DELTA`), confidence-weighted, and cumulatively clamped at 1.
- **Quarter rollover (session-driven, not calendar-driven)** → goals close, `τ` resets, and new goals' `startValue` re-baselines to current actuals **when a planning session commits** — not at the calendar date. Between the quarter boundary and that commit, hold the last computed score (a *review-due* state); do not auto-roll. Anchors persist; the EMA continues across the boundary (no discontinuity). See `lifeOS-planning-sessions.md` §3–§4.
- **Mis-set pace curve** → always expose `c` vs `e` in the UI so the user recalibrates the curve instead of distrusting the score.

---

## 6. Worked test vector (turn into a unit test)

Quarter `2026-Q2`, 91 days, `asOf` = day 50 → `τ ≈ 0.549`. Three vectors, uniform weight, one goal each, all `paceShape: linear`.

| Vector | Goal type | c | e | γ |
|---|---|---|---|---|
| Craft | milestone | 0.20 | 0.549 | −0.349 |
| Body | consistency (24/28) | 0.857 | 0.549 | +0.308 |
| Money | metric (€12k; 5k→20k) | 0.467 | 0.549 | −0.082 |

```
G0 = mean(−0.349, +0.308, −0.082)          = −0.041
alignment a = 0.70  →  p = 0.15·(1−0.70)    =  0.045
G  = −0.041 − 0.045                          = −0.086
S  = 70 + 70·(−0.086)                        ≈ 64.0      (operatingLevelRaw)
OL = 0.3·64.0 + 0.7·66 (prior)               ≈ 65.4      (operatingLevel)
```

Assertions: `operatingLevelRaw ≈ 64.0 (±0.5)`, `operatingLevel ≈ 65.4 (±0.5)`, top negative contributor = `Craft`, top positive = `Body`.

Add focused tests too: metric completion (`12,5,20 → 0.4667`), each pace curve at `τ=0.5`, the on-pace anchor (`G=0 → S=70`), fully-ahead (`G=1 → S=100`), fully-behind (`G=−1 → S=0`), and the alignment penalty bounds (`a=1 → p=0`, `a=0 → p=0.15`).

---

## 7. Suggested module layout

```
scoring/
  constants.ts        // §4
  completion.ts       // Stage 1: completion(goal, asOf)
  pace.ts             // Stage 2: expected(goal, asOf)
  gap.ts              // Stages 2–3: goalGap, vectorGap (+ staleness)
  alignment.ts        // Stage 4: alignment(window)
  compose.ts          // Stage 5: composite + 0..100 mapping
  smooth.ts           // Stage 6: ema(prev, raw)
  explain.ts          // Stage 7: rankContributors → contributors json
  recalculate.ts      // pure orchestrator → ScoresRow   (NO llm calls)
llm/
  extract.ts          // §3.1 — runs at ingest, writes structured inputs
  phrase.ts           // §3.2 — words the explanation
scoring/__tests__/    // the vectors in §6
```

`recalculate(date)` reads goals + inputs from the DB, runs Stages 1–6, calls `explain.rankContributors`, and returns a `scores` row. It is pure given DB state. `llm/phrase` is called *after* recalculation by the caller, never inside it.