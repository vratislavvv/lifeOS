# lifeOS

**Beta — custom built for personal usage**

A personal life operating system. Tracks progress across life vectors — Craft, Body, Money, Mind, Social, Rest — computes a daily operating level score, and surfaces everything through a multi-view app with an AI assistant called Lenna.

---

## What it does

- **Dashboard** — today's tasks, clock, focus timer, weekly/monthly calendar, and a radar chart of your vector progress at a glance
- **Operating level** — a 0–100 score where 100 means exactly on pace with your quarterly goals. Behind pace pulls the number down; being ahead doesn't push it above 100. Updated on every progress log
- **Lenna** — an AI assistant that logs progress, manages tasks and lists, and answers questions about your week. In planning sessions she leads the agenda: proposes goal specs, pushes back on broken goals, and won't let you leave without a plan. Powered by Claude
- **Vectors** — life areas you track (e.g. Body, Craft, Money). Each has a long-horizon anchor and quarterly goals with configurable pace curves (linear, easeIn, easeOut, sCurve). Vectors and their anchors are defined conversationally with Lenna during setup
- **Planning sessions** — Lenna-led setup (cold start) and quarterly review→replan sessions. Goals are authored as drafts, confirmed, then committed to active. Prior-quarter goals close with their final score recorded
- **On-demand replan** — mid-quarter session to abandon stale goals and author new ones without waiting for the quarter boundary
- **Tasks** — grouped into named lists with optional nested sublists (e.g. School → IB002, History). Tasks have due dates with overdue highlighting. Lenna can create, edit, move, and delete tasks and lists from chat. Collapsible groups, multi-select filter pills, animated transitions
- **Google integration** — connect Google Calendar and Google Fit in a single OAuth flow. Calendar events appear in the dashboard; health data syncs automatically

---

## Stack

- Next.js 15 (App Router, `force-dynamic`)
- SQLite via better-sqlite3 + Drizzle ORM — additive migrations on startup, no migration tool in prod
- Anthropic Claude (Lenna, input parsing, score explanations)
- Google OAuth 2.0 (Calendar + Fit, single consent screen)
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

# Optional — required only if you want Google Calendar / Fit sync
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The setup wizard runs on first launch. The database (`lifeos.db`) is created automatically and migrations run on startup — no manual migration step needed after pulling updates.

---

## Project structure

```
app/
├── api/
│   ├── auth/google/          # OAuth initiation + callback (Calendar + Fit scopes)
│   └── health/sync/          # Google Fit data sync endpoint
├── today/                    # dashboard: tasks, clock, focus timer, calendar, radar
├── tasks/                    # tasks view: nested lists, Lenna rail, filter pills
├── quarter/                  # quarter view: goals, τ bar, OL sparkline
│   ├── review/               # quarterly review→replan session
│   ├── replan/               # on-demand mid-quarter replan session
│   ├── ReviewSession.tsx
│   ├── ReplanSession.tsx
│   ├── reviewActions.ts
│   └── replanActions.ts
├── settings/                 # user preferences, Google connection, profile
└── setup/                    # cold-start setup wizard + Lenna setup session
    ├── steps/                # StepYou, StepConnect, StepLenna
    ├── SetupFlow.tsx
    ├── SetupSession.tsx
    └── sessionActions.ts
components/
├── LennaPanel.tsx            # shared resizable Lenna chat panel
└── RadarChart.tsx            # N-axis SVG vector radar (dark-mode aware)
lib/
├── dates.ts                  # todayStr, quarterBounds, prevQuarterOf, nextQuarterOf
├── vectors.ts                # default vector definitions
├── hooks/
│   └── useLennaMessages.ts   # module-level store (persists across routes, clears on reload)
├── db/
│   ├── schema.ts             # user, vectors, anchors, goals, inputs, tasks, task_groups, sessions, scores
│   └── index.ts              # DB singleton + additive startup migrations
├── google/
│   ├── oauth.ts              # getGoogleAuthUrl, token exchange, access token refresh
│   ├── calendar.ts           # Calendar API read helpers
│   └── fitness.ts            # Google Fit API read helpers
├── llm/
│   ├── client.ts             # Anthropic client
│   ├── chat.ts               # dashboard/tasks assistant (progress logging, task tools, group tools)
│   ├── setupChat.ts          # setup session chat (ORIENT/DRAFT phases)
│   ├── reviewChat.ts         # review session chat (REPORT/DISCUSS/REPLAN phases)
│   └── phrase.ts             # async one-sentence score explanations
├── scoring/
│   ├── constants.ts          # ON_PACE_SCORE, CONFIDENCE_FLOOR, EMA_ALPHA, …
│   ├── completion.ts         # Stage 1: per-goal completion c
│   ├── pace.ts               # Stage 2: expected pace e
│   ├── gap.ts                # Stage 3: gap Γ and staleness penalty
│   ├── alignment.ts          # Stage 4: alignment a
│   ├── compose.ts            # Stage 5: composite operating level S
│   ├── smooth.ts             # Stage 6: EMA smoothing → OL
│   ├── explain.ts            # Stage 7: contributor ranking
│   ├── recalculate.ts        # full pipeline (called after each input)
│   └── quarterReport.ts      # deterministic prior-quarter report artifact
└── ui/
    └── goalSubline.ts        # shared goal subline formatter
docs/
├── scoring-engine.md         # scoring engine spec (Stages 1–7)
├── session-planning.md       # planning session spec
├── trackability.md           # goal trackability tiers
└── vectors.md                # vector lifecycle and cap rules
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

