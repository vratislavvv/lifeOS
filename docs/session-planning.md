# lifeOS — Planning Sessions & Lenna Ingestion (feature spec)

---

## 0. The reframe (why this exists)

The current intake is the weak point: the opening questions cost the user effort but deposit little usable data, and progress dribbles in vaguely. Fix:

**Every Lenna conversation is a structured-input pipe, not small talk. A conversation that doesn't end in committed rows (goals, anchors, recording methods, or `inputs`) was wasted.**

Corollary — **conversation is expensive; spend it only where judgment is needed.** Mechanical preferences (timezone, units, currency, week start, time format, `lennaTone`, `lennaAutonomy`) stay fast tap-pickers. Lenna's *dialogue* is reserved for the things that genuinely need drafting and pushback: goals, anchors, and how each goal's progress should be recorded. Never burn a conversational turn on something that should be a tap.

Two structured-output pipes carry this, and they are **not** the same:
- **Progress logging** (dashboard chat, manual progress entries) → the extract contract (`lifeOS-scoring-engine.md` §3.1): tags effort/values to *existing* `active` goals.
- **Authoring** (setup + replan: new vectors/anchors/goals and their recording methods) → the **session-authoring output** defined in §5.1.

Either way, **the transcript is disposable; the structured rows are the record.**

---

## 1. Two session types, one object

Both setup and quarterly planning are **guided sessions**: Lenna-led, phased, with a lifecycle and a stored artifact. This is what makes them structurally different from the dashboard chat (§4).

### New entity: `sessions`
```
id            text PK
type          enum(setup | quarter_review | replan_ondemand)
quarter       text                 // the quarter being planned, e.g. "2026-Q3"
status        enum(open | complete | abandoned)
phase         enum                 // current phase (see below)
report        json?                // the prior-quarter report artifact (review sessions only)
committedGoalIds json?             // goals authored/committed in this session
createdAt     text
completedAt   text?
```

### Goal lifecycle (replaces the bare `active: boolean`)
```
goals.status  enum(draft | proposed | active | completed | abandoned)
```
- `draft`/`proposed` goals are authored during a session and are **not scored** until committed.
- On commit they become `active`.
- Prior-quarter goals are closed to `completed` or `abandoned` (with their final `c` recorded).

---

## 2. Setup session (cold start)

`type: setup`. Runs once; ends with `user.setupDone = true`. The user cannot enter the main app until it completes.

**Phase 1 — Orient.** Lenna establishes the user's **vectors** (3–5 life directions; from a dev standpoint a vector is just a row in `vectors`), then for each a long-horizon **anchor** ("what do you want to be true by [age]?"), and the **current state**: pull real current values from connected integrations (GitHub/Strava/bank/calendar) and ask only for the manual numbers a sensor can't see. Current state seeds each future goal's `startValue` — **measured now, never a pretend zero** (see `lifeOS-spec.md` start-point rule).

**Phase 2 — Draft this quarter's goals.** For each vector, Lenna draws out the goal(s) for this quarter. The critical behavior: when a goal is vague or its **recording method is unclear, Lenna drafts a concrete version and proposes it** — she picks the `type` (milestone/metric/consistency), the `targetValue`/`startValue`, `cadencePerWeek`, and `paceShape`, and shows it back: *"I'd track this as a metric goal, €5k→€20k, linear pace — work for you?"* She does not leave recording method up to vibes. Drafting requires `lennaAutonomy ≥ draft`; if set to `suggest`, she describes the method in words and the user fills it.

**Phase 3 — Commit.** User confirms; goals flip `draft → active`; `setupDone = true`; first `recalculate` runs (returns a `calibrating` state until there's enough signal — never a fabricated number).

---

## 3. Quarterly review→replan session

`type: quarter_review` (boundary) or `replan_ondemand` (mid-quarter). A **guided session driven by Lenna through four phases**:

```
┌──────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐
│  REPORT  │ → │  DISCUSS  │ → │  REPLAN  │ → │  COMMIT  │
└──────────┘   └───────────┘   └──────────┘   └──────────┘
 Lenna         walk through    author next     confirm →
 presents      it together     quarter's       goals active,
 the numbers   draw lessons    goals (fresh)   session complete
```

**Phase 1 — Report.** Lenna opens with the report on the quarter that just ended. **Numbers from code, words from Lenna** (same pattern as the score explanation): a deterministic summary function computes the report from that quarter's `scores` + `goals` + `inputs` — per-goal final `c` vs target, the operating-level arc (start→end, high/low), which vectors moved, alignment, wins and misses — and Lenna narrates it. Stored in `sessions.report`.

**Phase 2 — Discuss.** They go through it. Lenna draws out what worked, what didn't, what to drop. This is where her read matters — she names patterns the user might dodge ("Body carried the quarter; Craft you started strong and ghosted by week 3").

**Phase 3 — Replan.** Set next quarter's goals — **and this is a hard rule: next quarter's goals are authored fresh and may be completely different from last quarter's, not continuations of the same metric.** The *anchor* persists; the quarterly goal laddering to it does not. Example: a fighting anchor might be `attend 8 fights` (consistency) in Q4 and `gain muscle, +4kg` (metric) in Q1 — different type, different recording method, same anchor. A vector may even sit out a quarter (no goal → excluded from that quarter's composite). Same drafting + pushback behavior as setup Phase 2.

**Phase 4 — Commit.** User confirms the new set. Prior-quarter goals close (`completed`/`abandoned`, final `c` recorded). New goals go `active` with **`startValue` re-baselined to the user's current actuals now** and a fresh per-goal window (`τ` resets). Session → `complete`; the EMA keeps running across the boundary (no score discontinuity — see scoring engine §5).

**Boundary vs on-demand.** At a quarter boundary the review session is **auto-created** (`open`) and surfaced prominently in the Quarter view; until the user completes it, the app keeps showing last quarter's final state rather than silently rolling over. A `replan_ondemand` session can also be started mid-quarter when life changes; it revises the *current* quarter — closing some goals (`abandoned`, excluded from scoring from that point) and authoring new ones with their own mid-quarter window.

---

## 4. The two Lennas — dashboard chat vs planning session

Same assistant identity, same extraction pipe, **different mode and lifecycle.** This distinction is the product answer to "why are there two chats."

| | Dashboard assistant | Planning session |
|---|---|---|
| **Stance** | reactive — *user* initiates | Lenna *leads* the agenda |
| **Tense** | present — "what now?", "I did X" | retrospective + forward — review then plan |
| **Lifecycle** | none; always-on, ephemeral messages | a session object: opens, phases, closes |
| **Output** | ephemeral turns + the odd `input` | a stored artifact (report + committed goals) |
| **Lives in** | the right rail, every view | the Quarter view |
| **When** | any time | quarter boundary (auto) or on-demand |

Design intent: the planning session should feel like **Lenna walking you through your quarterly review and not letting you leave without a plan** — not a chat window that happens to be elsewhere. It has a beginning and an end; the dashboard chat does not.

---

## 5. Lenna's behavior: drafting + backbone

Two behaviors define her in these sessions:

**Drafting.** When intent is clear but the *form* is fuzzy, she proposes a concrete, scoreable version (type, targets, pace, cadence) rather than asking the user to specify it. Propose → confirm always: nothing writes to `goals` as `active` until the user confirms in Commit; proposals live as `draft`/`proposed`.

**Backbone (the "Donna" spec).** Perceptive, reads what the user actually means, confident, lightly witty, usually right and not shy about it. She **will not rubber-stamp a broken goal** — if it's unworkable (impossible in 90 days, internally contradictory, or no defined way to measure progress), she names it plainly, explains *why*, and offers a version that works ("you can't train for 8 fights and add 6kg of muscle in one quarter — they fight each other; pick the fight camp and we'll bank the strength work for Q1"). The user can override once she's made the case — it's their call — but she makes sure they make it with eyes open.

This backbone is **constant and independent of `lennaTone`.** `lennaTone` (warm | neutral | direct) only modulates *delivery* — warm-Donna softens the edges, direct-Donna is blunter — never whether she pushes back. She always has a spine.

### 5.1 Session-authoring output (how drafts become rows)

Setup and replan author *new* structure, which the progress extract contract (`lifeOS-scoring-engine.md` §3.1) does **not** cover — that one only logs progress to existing goals. So a planning session emits its own structured output whenever Lenna and the user agree on something:

```json
{
  "drafts": [
    {
      "entity": "vector | anchor | goal",
      "vectorId": "string | null",
      "anchorId": "string | null",
      "description": "string",
      "type": "milestone | metric | consistency | null",   // goals only
      "startValue": "number | null",
      "targetValue": "number | null",
      "cadencePerWeek": "number | null",                    // consistency goals only
      "paceShape": "linear | easeIn | easeOut | sCurve | null",
      "paceParam": "number | null",
      "rationale": "string"                                 // why Lenna drafted it this way
    }
  ]
}
```

Rules: goal drafts land as `goals` rows with **`status: draft`** (then `proposed` once shown to the user) — never `active`. The recording fields (`type`, `startValue`/`targetValue`, `cadencePerWeek`, `paceShape`/`paceParam`) are exactly the ones the scoring engine reads, so a committed draft is immediately scoreable with no translation. Nothing becomes `active` until the Commit phase. This is the authoring counterpart to §3.1's progress logging; together they are the two pipes from §0.

---

## 6. Schema deltas (summary)

- **New `sessions` table** (§1).
- **`goals.status`** enum `draft|proposed|active|completed|abandoned`, replacing `active: boolean`. Only `active` goals are scored — the scoring engine excludes every other status (see `lifeOS-scoring-engine.md` §1 and §5).
- Relies on fields already added in the scoring engine spec: `goals.startDate/endDate`, `paceShape/paceParam`, `cadencePerWeek`, per-goal window. Mid-quarter goals use their own `startDate`, so `τ` is correct for them automatically.
- `anchors` unchanged — they persist across quarters and are the continuity the quarterly goals ladder to.

---

## 7. Scoring hooks

- Committing a session is the moment goals go `active` and (for review/replan) `startValue` re-baselines to current actuals → triggers a `recalculate`.
- `abandoned` goals are excluded from the composite from their abandonment date forward; never penalize the user for a goal they consciously dropped.
- A vector with no `active` goal this quarter is excluded from the composite and surfaced as "no goal set," per scoring engine §3.
- Report generation is a deterministic summary over the closing quarter's `scores`/`goals`/`inputs`; Lenna only narrates it.

---

## 8. Edge cases

- **Setup abandoned** → `status: abandoned`; user stays out of the app until a setup session completes.
- **Boundary reached, review not done** → auto-create the `open` review session, surface it, keep showing last quarter's final state; do not silently roll goals over.
- **Review session interrupted** → persists as `open`; user resumes where they left off (phase is stored).
- **User rejects every draft** → iterate in Replan; nothing commits until confirmed; a session can be saved `open` and resumed.
- **On-demand replan collides with an upcoming boundary** → the on-demand session revises the current quarter; the next boundary still triggers its own review of that quarter as it ends.
- **Goal with no measurable progress method** → Lenna must resolve this in drafting before it can be committed; a goal cannot go `active` without a valid `type` + recording method.

---

## 9. Build order

1. `sessions` table + `goals.status` migration.
2. Setup session (Phases 1–3) end-to-end, writing real `vectors`/`anchors`/`goals` via the extract contract — replace the current vague intake entirely.
3. Deterministic quarter-report summary function (testable, numbers-only).
4. Quarter review→replan session (Phases 1–4), boundary auto-creation, re-baselining on commit.
5. On-demand replan.
6. Wire Lenna's drafting + backbone behavior; confirm propose→confirm gating prevents any pre-commit writes.

Keep the dashboard assistant untouched in this work — it's a different mode (§4) and lands in its own pass.