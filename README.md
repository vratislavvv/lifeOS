# lifeOS

**Custom built for personal usage**

A personal life operating system. Tracks progress across life vectors — Craft, Body, Money, Mind, Social, Rest — computes a daily operating level score, and surfaces everything through a single dashboard with an AI assistant called Lenna.

---

## What it does

- **Dashboard** — today's tasks, a focus timer, a weekly/monthly calendar, and your quarter progress at a glance
- **Operating level** — a 0–100 score computed from how your actual progress compares to expected pace across all active goals; updated on every progress log
- **Lenna** — an AI assistant that logs progress, adds tasks, and answers questions about your week. In planning sessions she leads the agenda: proposes goal specs, pushes back on broken goals, and won't let you leave without a plan. Powered by Claude
- **Vectors** — life areas you track (e.g. Body, Craft, Money). Each has a long-horizon anchor and quarterly goals with configurable pace curves (linear, easeIn, easeOut, sCurve)
- **Planning sessions** — Lenna-led setup (cold start) and quarterly review→replan sessions. Goals are authored as drafts, confirmed, then committed to active. Prior-quarter goals close with their final score recorded
- **On-demand replan** — mid-quarter session to abandon stale goals and author new ones without waiting for the quarter boundary
- **Tasks** — grouped, prioritised by importance/urgency (Eisenhower matrix), with optional due dates. Lenna can create tasks directly from chat

---

## Stack

- Next.js 15 (App Router)
- SQLite via better-sqlite3 + Drizzle ORM
- Anthropic Claude (Lenna, input parsing, score explanations)
- TypeScript throughout
- Vitest for the scoring engine

---

## Running locally

**Prerequisites:** Node 20+, an Anthropic API key

```bash
git clone https://github.com/vratislavvv/lifeOS.git
cd lifeOS
npm install
```

Create `.env.local` in the root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The setup wizard runs on first launch. The database (`lifeos.db`) is created automatically and migrations run on startup.

---

## Project structure

```
app/
├── setup/                    # cold-start setup wizard + Lenna setup session
│   ├── steps/                # StepYou, StepVectors, StepLenna, StepConnect
│   ├── SetupFlow.tsx         # pre-session wizard (name, vectors, preferences)
│   ├── SetupSession.tsx      # Lenna-led ORIENT → DRAFT → COMMIT session
│   └── sessionActions.ts     # server actions: turn, commit
├── today/                    # main dashboard (tasks, focus timer, calendar)
├── quarter/                  # quarter view: goals, τ bar, OL sparkline
│   ├── review/               # quarterly review→replan session
│   ├── replan/               # on-demand mid-quarter replan session
│   ├── ReviewSession.tsx
│   ├── ReplanSession.tsx
│   ├── reviewActions.ts
│   └── replanActions.ts
lib/
├── dates.ts                  # todayStr, quarterBounds, prevQuarterOf, nextQuarterOf
├── vectors.ts                # default vector definitions
├── db/
│   ├── schema.ts             # user, vectors, anchors, goals, inputs, tasks, sessions, scores
│   └── index.ts              # DB singleton + migration
├── llm/
│   ├── client.ts             # Anthropic client
│   ├── chat.ts               # dashboard assistant (progress logging, tasks)
│   ├── setupChat.ts          # setup session chat (ORIENT/DRAFT phases, tool API)
│   ├── reviewChat.ts         # review session chat (REPORT/DISCUSS/REPLAN phases)
│   ├── replanChat.ts         # replan session chat (DISCUSS/REPLAN phases)
│   └── phrase.ts             # async one-sentence score explanations
├── scoring/
│   ├── constants.ts          # MAX_INPUT_DELTA, CONFIDENCE_FLOOR, EMA_ALPHA
│   ├── completion.ts         # Stage 1: per-goal completion c
│   ├── pace.ts               # Stage 2: expected pace e; goalTau, expectedPace, quarterPaceNow
│   ├── gap.ts                # Stage 3: gap Γ and staleness penalty
│   ├── alignment.ts          # Stage 4: alignment a (effort distribution across vectors)
│   ├── compose.ts            # Stage 5: composite operating level S
│   ├── smooth.ts             # Stage 6: EMA smoothing → OL
│   ├── explain.ts            # Stage 7: contributor ranking
│   ├── recalculate.ts        # full recalculation pipeline (called after each input)
│   └── quarterReport.ts      # deterministic prior-quarter report artifact
└── ui/
    └── goalSubline.ts        # shared goal subline formatter (metric/consistency/pace)
docs/
├── scoring-engine.md         # scoring engine spec (Stages 1–7)
└── session-planning.md       # planning session spec (setup, review, replan, lennaAutonomy)
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check without building |
| `npm test` | Run scoring engine tests (Vitest) |
| `npm run db:studio` | Open Drizzle Studio to browse the database |
