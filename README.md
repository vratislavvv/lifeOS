# lifeOS

A personal life operating system. Tracks progress across life vectors — Craft, Body, Money, Mind, Social, Rest — computes a daily operating level score, and surfaces everything through a single dashboard with an AI assistant called Lenna.

Built for one user, running locally.

---

## What it does

- **Dashboard** — today's tasks, a focus timer, a weekly/monthly calendar, and your quarter progress at a glance
- **Operating level** — a 0–100 score computed from how your actual progress compares to expected pace across all your active goals
- **Lenna** — an AI assistant that logs progress, adds tasks, and answers questions about your week. Powered by Claude Haiku
- **Vectors** — six life areas you track. Each has quarterly goals with configurable pace curves
- **Tasks** — grouped, prioritised by importance/urgency (Eisenhower matrix), with optional due dates

---

## Stack

- Next.js 15 (App Router)
- SQLite via better-sqlite3 + Drizzle ORM
- Anthropic Claude Haiku (for Lenna and input parsing)
- TypeScript throughout

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

Open [http://localhost:3000](http://localhost:3000). The setup wizard runs on first launch. The database (`lifeos.db`) is created automatically and migrations run on startup — nothing else to do.

---

## Project structure

```
app/
├── setup/
│   ├── steps/
│   │   ├── StepConnect.tsx
│   │   ├── StepLenna.tsx
│   │   ├── StepQuarter.tsx
│   │   ├── StepReady.tsx
│   │   ├── StepVectors.tsx
│   │   └── StepYou.tsx
│   ├── actions.ts
│   ├── NavRow.tsx
│   ├── page.tsx
│   ├── Rail.tsx
│   ├── Segmented.tsx
│   ├── SetupFlow.tsx
│   ├── setup.module.css
│   └── types.ts
├── today/
│   ├── actions.ts
│   ├── CalSection.tsx
│   ├── Clock.tsx
│   ├── FocusTimer.tsx
│   ├── page.tsx
│   ├── taskActions.ts
│   ├── TodayShell.tsx
│   └── today.module.css
├── globals.css
├── layout.tsx
└── page.tsx
lib/
├── db/
│   ├── index.ts
│   └── schema.ts
├── llm/
│   ├── chat.ts
│   ├── client.ts
│   └── extract.ts
└── scoring/
    └── compute.ts
docs/
└── scoring-engine.md
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check without building |
| `npm run db:studio` | Open Drizzle Studio to browse the database |
