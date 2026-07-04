# lifeOS — Goal Trackability (feature spec)

---

## 0. The core rule

**You never score the untrackable outcome. You score the trackable work that ladders to it.**

- The aspirational, hard-to-measure outcome ("sub-3 marathon by 30", "purple belt by 28") lives at the **anchor**, where it's allowed to be unmeasured.
- Only quarterly **goals** are scored, and a goal may only be committed if it has an observable signal.
- When the outcome isn't directly trackable, **decompose** it into goals that are (possibly >1 goal under one anchor).

So `recalculate` never has to answer "how close to a purple belt?" — only "did the tracked pieces move?"

---

## 1. The gate — five tiers, first match wins

Run top-down when drafting a goal; the first "yes" fixes the tier.

| Tier | Test | Recording method | Data source | Confidence |
|---|---|---|---|---|
| `instrumented` | continuous objective data (ideally an API) | `metric` / `consistency` | auto (strava/github/bank/calendar) or manual number | exact (1.0) |
| `proxy` | a leading indicator predicts the outcome | `metric` on the proxy (deterministic formula) | derived from auto/manual inputs | model-specific (stored on `proxyModel`; e.g. Riegel ~0.85) |
| `checkpoint` | observable discrete steps toward a judged outcome | `consistency` (the process) + milestone inputs when steps occur | attested events + optional auto | process exact; steps exact when logged |
| `attested` | only periodic human judgment | scheduled `milestone` / rating input | user or coach, on a cadence | subjective (~0.5) |
| *(reframe)* | none of the above | — | — | — |

**Reframe** is not a stored tier. If a goal lands here, Lenna reframes it into a lower tier *before* any `propose_goal` — the backbone (planning-sessions §5) doing structural work, and the concrete form of planning-sessions §8 "a goal cannot go `active` without a valid recording method."

---

## 2. Decomposition

When the anchor's outcome isn't directly trackable, split it into scoreable goals under the **same anchor**. This is why one vector may hold more than one goal in a quarter — **the setup/replan flow must allow multiple `propose_goal` calls per vector; a vector is "resolved" once it has ≥1 goal (or a skip), not exactly one.**

**Marathon sub-3 → `proxy` (Tier 2).** The outcome feels untrackable (one binary event, years out), but a leading indicator predicts it: projected marathon time from recent efforts via Riegel, `T₂ = T₁·(D₂/D₁)^1.06`. Model as one `metric` goal where `currentValue` = the projected time and `c = (startProjection − currentProjection) / (startProjection − target)`. Source: Strava recent efforts + manual race results. The actual sub-3 is just the milestone resolving on race day. The formula is deterministic and lives in `lib/scoring`. Confidence: Riegel is well-validated → `proxyModel: "riegel"` carries `confidence: 0.85`.

**Purple belt → `checkpoint` (Tier 3).** Promotion is the coach's call — there's no continuous signal and `c` can't move between promotions regardless of training effort. Don't make a belt goal. Under the BJJ anchor author **one** `consistency` goal on mat sessions (4/week — the actual scored work). Stripe and belt promotions are logged as `milestone` inputs when they happen, updating completion for that event. This keeps the score honest: it reflects the work, not a judgment outside the user's control.

---

## 3. Confidence & honesty (no change to the scoring math)

Tier drives three things **without touching the formulas** in `lib/scoring`:

1. **How progress is obtained** — a direct auto value, a proxy formula, or an attested event.
2. **A display band** — `proxy` goals render as an *estimate* (e.g. "≈ on pace"), not a hard figure; the contributors/UI mark it. `checkpoint` goals do **not** get the estimate band — between steps you know exactly where you are (last confirmed stripe), that's a fact not a guess. Ties to scoring §7 (contributors) and the §5 rule "always expose `c` vs `e`."
3. **The default `confidence` on milestone/attested inputs** — which Stage 1 already weights (`Σ δ·confidence`): checkpoint step inputs ~1.0, attested ratings ~0.5. `metric`/`consistency` completion is objective and uses no confidence weight (scoring Stage 1), so their honesty comes from the display band (proxy only), not a weight.

Net: the number is a *fact* where instrumented or checkpoint, an *estimate* where proxy, and *subjective* where attested — it never pretends to know what it's guessing.

---

## 4. Schema deltas

`goals` add:
- `trackabilityTier: enum(instrumented | proxy | checkpoint | attested)`
- `dataSource: text?` — e.g. `"strava"`, `"github"`, `"bank"`, `"manual"`, `"coach"`
- `proxyModel: text?` — deterministic model id (e.g. `"riegel"`); `proxy` tier only. Each model carries its own calibrated confidence (Riegel: 0.85); not a flat 0.7 for all proxies.
- `attestationCadence: text?` — e.g. `"event"`, `"monthly"`; `checkpoint`/`attested` only

No new tables. Decomposition uses the existing `anchorId → goals` relation (many goals per anchor already allowed). The `reframe` tier is never persisted.

---

## 5. Authoring integration (as-built)

The gate is drafting logic, gated by `lennaAutonomy` exactly like current goal drafting.

- **`propose_goal` gains params:** `trackabilityTier`, `dataSource`, `proxyModel?`, `attestationCadence?`. Lenna classifies the tier as part of proposing a goal; **a goal cannot be proposed without a resolved tier** (reframe first).
- **Reframe UX:** when Lenna decomposes a goal into tracked pieces, she explains the reframe *before* calling `propose_goal` — never silently. Example: *"Purple belt is the anchor — I can't score the promotion itself since that's your coach's call. For this quarter I'd track mat sessions at 4×/week (the real driver) and log stripe promotions when they happen as milestone inputs. Sound right?"* This explanation is mandatory; it's the backbone doing structural work, not gatekeeping.
- **`goalDraftInstruction(autonomy)`** in `setupChat.ts`, `reviewChat.ts`, `replanChat.ts` should instruct Lenna to run the §1 gate and fill these params when she drafts.
- **Phase-gating:** a vector resolves with ≥1 goal (decomposition may add several) or a skip. Don't cap `propose_goal` at one call per vector. When decomposition is complete, Lenna states she is moving on before turning to the next vector — she does not keep proposing goals for a resolved vector.
- **Attestation:** `attestationCadence` schedules Lenna prompts ("any promotions/results since we last spoke?"); the reply becomes a `log_progress` milestone input. Event-driven results can be logged any time.

---

## 6. Scoring touchpoints (see `lifeOS-scoring-engine.md`)

- **Metric completion (Stage 1)** may read a **proxy-derived `currentValue`** when `trackabilityTier = proxy`; the proxy model (e.g. Riegel) is a deterministic function over recent inputs, computed in `lib/scoring`, so `recalculate` stays pure.
- **Contributors/UI** mark tier ≥ `proxy` goals as estimates (the display band from §3).
- Nothing else in the engine changes — trackability only decides how a goal's inputs are produced and how confident/estimated they are.

---

## 7. Build order

1. `goals` columns migration (`trackabilityTier`, `dataSource`, `proxyModel`, `attestationCadence`).
2. Extend `propose_goal` params + `goalDraftInstruction` to run the gate and classify the tier; allow multiple goals per vector.
3. Proxy models in `lib/scoring` (start with Riegel for running); wire proxy-metric completion.
4. Attestation-cadence prompts → `log_progress`.
5. UI estimate band for tier ≥ `proxy`.