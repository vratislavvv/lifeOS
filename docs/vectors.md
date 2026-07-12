# lifeOS — Vectors (custom vectors & lifecycle)

> **For Claude Code.** Companion to `lifeOS-spec.md`, `lifeOS-planning-sessions.md`, `lifeOS-scoring-engine.md`, `lifeOS-trackability.md`, `lifeOS-design-system.md`.
> Turns vectors from a fixed preset menu into **user-owned entities** you can create (in setup or later via Lenna), rename, recolour, reorder, archive, and reactivate. Reuses the existing authoring tools and propose→confirm gating.

---

## 0. What changes

Today: a fixed set of ~6 presets you pick from and can't really extend. Change: **vectors become yours.** Create your own in setup *or* later through Lenna; edit and archive them over time. The presets don't go away — they become an optional **starter palette**, not a cage.

---

## 1. What a vector is — and what it isn't

A vector is a durable **life area / direction** (Craft, Body, Money, Fatherhood, Faith, Adventure). It is **not** a goal or a task. The ladder is fixed:

**vector (area) → anchor (long-term destination) → quarterly goal (the chunk).**

This distinction is a guard, not pedantry. The moment users can create vectors, someone will try to make *"run a marathon"* a vector — but that's a **goal** under a fitness vector, not a direction. **Lenna must catch this and reframe:** if the proposed vector is really a single achievement, she names it and offers to file it as an anchor/goal under the right area instead. Without this guard, vectors sprawl into a task list and the whole model collapses.

---

## 2. The starter palette (anti-blank-page)

The preset set (Craft / Body / Money / Mind / Social / …) is **not a click screen** — it's an **example set fed to Lenna** that she draws on to suggest during the setup conversation. The user chooses their *own* life areas: take an example as-is, rename it, or invent something entirely their own. Lenna offers the examples as inspiration and can propose fits, but never makes the user pick from a fixed grid. She writes each chosen vector via `create_vector` (or by accepting a renamed example) inside the orient phase.

Rationale: the app exists to kill blank-page paralysis, so we *seed the conversation* with a starting shape — but the user drives, and nothing is locked. Suggest, don't cage. Post-setup there's no palette at all; vectors are created on demand through the add-vector flow (§4).

---

## 3. The handful rule (anti-bloat)

Active vectors are **capped low** — recommend a soft max around **6** (tune it). Beyond it, Lenna pushes back with the backbone from planning-sessions §5: *"nine active vectors isn't focus, it's a to-do list — which of these actually matter right now?"* The user can override once she's made the case, but she makes the case.

Rationale: the operating level is only meaningful across a *handful* of real directions. Sprawl dilutes every vector's weight and reintroduces exactly the overwhelm the product is built to remove. The cap is a feature, not a limitation.

---

## 4. Lifecycle

**Create in setup** (orient phase): accept a preset, rename it, or `create_vector` a custom one. Lenna helps name and frame it as an area.

**Create later — the add-vector flow.** Triggered by **intent recognition** in the dashboard chat: when the user expresses wanting to track a new area ("I want to add a vector", "start tracking my writing"), Lenna treats it as an add-vector request, not an ordinary reply. Two guards run first: the vector-vs-goal check (§1 — if it's really a goal, reframe it under an existing vector) and the handful cap (§3 — if already at the cap, push back before creating). Then three steps:

1. **Create the vector immediately.** Once the area and name are clear, Lenna calls `create_vector` right away. The row is written and the vector **appears at once across the UI as _pending_** — a new axis on the dashboard hexagon, a pending row in the current-quarter trajectory, and a pending entry under long-term goals. The user sees it land instantly; the rest fills in as they answer.

2. **Gather what the program needs.** A vector isn't usable until three fields exist, and they map one-to-one onto the surfaces it must populate:
   - **Long-term goal → anchor.** "What's the long-term destination here, and by when?" → `propose_anchor` (description + the user's *own* horizon, e.g. `targetAge: 25` — each user differs). Fills the **long-term goals** section.
   - **This quarter's goal.** "What's the move this quarter?" → `propose_goal`, through the trackability gate (`lifeOS-trackability.md`) and the ambiguity rule (confirm only when genuinely unclear). Fills the **current-quarter trajectory**.
   - **Current state — where you are now.** The goal's `startValue`, measured today: pulled from an integration if one exists, otherwise asked. Sets the start of the trajectory track (so `c = 0` at the outset).

   Ask the anchor first (it frames the quarter goal), then the goal, folding current state into that question. Conversational, not a form.

3. **Confirm & commit.** Propose→confirm still holds: the anchor and goal sit as `draft`/`proposed` until the user confirms. On commit, the goal goes `active` with `startDate = today` and its own window (mid-quarter add), and the vector is fully populated across all three surfaces.

Until it has an active goal the vector stays *pending*: visible on the hexagon at a neutral baseline and marked "no goal yet" in the trajectory, but excluded from the operating level (existing rule) — so adding it never jolts the score. The vector row itself is created up front (it's just a container, no scoring impact and reversible via archive/remove); only the anchor and goal pass through propose→confirm.

**Edit:** rename, recolour, reorder, re-weight via `edit_vector`.

**Three distinct "stop caring" operations — keep them separate:**
- **`skip_goal`** *(existing)* — the vector sits out **this quarter** (no goal); anchor and vector persist.
- **`archive_vector`** *(new)* — retire indefinitely: `active = false`, history preserved, excluded from scoring. Reactivate later.
- **`remove_vector`** *(existing, unchanged)* — hard delete, **only** for a vector that was never really started (setup-time disinterest). Not for anything with history — that's what archive is for.

**Reactivate:** an archived vector flips `active = true`, then gets a fresh anchor/goal through the add-vector flow.

### 4.1 Where an added vector appears (three surfaces)

Adding a vector must populate three places, and the questions in the flow map one-to-one onto them:

- **Dashboard hexagon** — the vectors radar. Each vector is an axis whose value is its per-vector score/pace (scoring `vectorBreakdown`). The "hexagon" is really a **dynamic N-gon that reshapes with vector count** — which is a second, visual reason for the handful cap (§3): past ~6–7 axes it turns to unreadable mush. A new vector appears immediately as a fresh axis at a neutral baseline until its goal is `active`.
- **Current-quarter trajectory** (part 1 of the trajectory view) — the vector's this-quarter goal drawn as the pace track (start / on-pace / now / target). Needs the quarter goal + current state (`startValue`).
- **Long-term goals** (part 2 of the trajectory view) — the vector's anchor and its horizon.

A pending vector shows in all three the moment it's created; each surface fills in as its corresponding question is answered and commits.

---

## 5. Tools (authoring)

New:
- `create_vector({ label, color?, icon?, description? })` → inserts a `vectors` row (`active`, `createdVia: custom`), slug `id` generated from `label`.
- `edit_vector({ vectorId, label?, color?, order?, weight? })`
- `archive_vector({ vectorId })` → sets `active = false` (row + history kept)

Existing, reused: `remove_vector`, `skip_goal`, `propose_anchor`, `propose_goal`, `advance_phase`.

Reconciliation rule for Lenna: **remove = delete a never-started vector; archive = retire an established one.** She must not `remove_vector` anything that has goals/inputs — archive it.

---

## 6. Schema deltas (`vectors`)

Reuse the existing `active: boolean` for archive (`active = false` **is** archived — row and history kept), so no status-enum migration is needed. Add:
- `createdVia: enum(preset | custom)`
- `icon: text?` (optional)
- `description: text?` (optional)
- `weight: real default 1` (the scoring `W_v`; add if not already present)

No new tables. Slug `id` generated from `label` with collision suffixing (`fatherhood`, `fatherhood-2`).

---

## 7. Scoring & design hooks

**Scoring** (`lifeOS-scoring-engine.md`): a vector contributes only while `active` **and** it has a `status = active` goal — both already true in the engine. So **adding a vector never jolts the score** until it has an active goal, and the composite (a weighted mean) **renormalises automatically** as vectors come and go. Archiving a vector mid-quarter closes its goals (`abandoned`, excluded from that point) exactly like an on-demand replan abandonment.

**Design** (`lifeOS-design-system.md`): the design system defines **5** dry-matte vector pigments. Custom vectors beyond five need either a palette extension or reuse-with-a-distinct-icon — flag for Claude Design. `create_vector` picks a pigment (+ optional icon) at creation.

---

## 8. Edge cases

- **Add mid-quarter** → goal `startDate = today`, own window.
- **Archive mid-quarter** → goals close (`abandoned`), excluded from that point; operating level renormalises.
- **Vector with an anchor but no goal this quarter** → excluded from the composite, surfaced as "no goal set" (existing rule).
- **User tries to make a goal a vector** → Lenna reframes it into area + anchor/goal (§1).
- **Over the handful cap** → Lenna pushback; override allowed after she's made the case.
- **Slug collision** → suffix.
- **Removing vs archiving** → if the vector has any goals/inputs, archive; never hard-delete history.

---

## 9. Build order

1. `vectors` schema deltas (`createdVia`, `icon?`, `description?`, `weight`) + slug generation.
2. `create_vector` / `edit_vector` / `archive_vector` tools; teach Lenna the remove-vs-archive rule.
3. Setup: render presets as an editable **starter palette** (accept / rename / remove) plus "create your own."
4. The **add-vector flow**: intent recognition → `create_vector` immediately (vector renders as *pending* across hexagon, quarter trajectory, and long-term goals) → gather anchor + quarter goal + current state → confirm/commit with `startDate = today`. Verify the pending vector appears on all three surfaces at creation, not just at commit.
5. **Handful-cap** pushback wired into the drafting instructions / system prompts.
6. **Vector-vs-goal reframe guard** in Lenna's drafting instructions (`setupChat.ts`, `reviewChat.ts`, `replanChat.ts`).

---

## 10. Optional enhancement (not core)

A vector can carry **default data-source hints** that pre-fill the trackability gate — e.g. a "Running" vector suggests Strava, a "Craft" vector suggests GitHub — so new goals under it start one step closer to instrumented. Nice-to-have; skip for v1 if it adds friction.