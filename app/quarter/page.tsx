import { redirect } from 'next/navigation';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, scores, inputs, sessions } from '@/lib/db/schema';
import { goalTau, quarterPaceNow, expectedPace } from '@/lib/scoring/pace';
import { computeCompletion } from '@/lib/scoring/completion';
import { quarterBounds, prevQuarterOf, nextQuarterOf, todayStr } from '@/lib/dates';
import type { QuarterReport } from '@/lib/scoring/quarterReport';
import type { PastQuarterEntry } from './QuarterShell';
import QuarterShell from './QuarterShell';

export const dynamic = 'force-dynamic';

export default async function QuarterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now      = new Date();
  const today    = todayStr();
  const currentQ = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const params   = await searchParams;
  const viewedQ  = params.q ?? currentQ;
  const isCurrentQ = viewedQ === currentQ;

  const bounds = quarterBounds(viewedQ);
  // For historical quarters, compute completion as of the quarter's last day
  const asOf   = isCurrentQ ? today : bounds.end;

  const [qYear, qMon] = [parseInt(viewedQ.split('-Q')[0]), (parseInt(viewedQ.split('-Q')[1]) - 1) * 3];
  const startLabel = new Date(qYear, qMon, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel   = new Date(qYear, qMon + 3, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ── Review due (current quarter only) ─────────────────────────────────────
  const closedQ      = prevQuarterOf(currentQ);
  const closedBounds = quarterBounds(closedQ);
  const reviewDue    = today > closedBounds.end;

  const existingReview = reviewDue
    ? db.select().from(sessions)
        .where(and(eq(sessions.type, 'quarter_review'), eq(sessions.quarter, currentQ)))
        .get()
    : null;

  // Banner only if there were actual inputs in the closed quarter
  const hasPrevInputs = reviewDue
    ? db.select().from(inputs)
        .where(and(gte(inputs.date, closedBounds.start), lte(inputs.date, closedBounds.end)))
        .all().length > 0
    : false;

  const reviewPending = isCurrentQ && reviewDue && hasPrevInputs &&
    (!existingReview || existingReview.status === 'open');

  // ── Data for the viewed quarter ────────────────────────────────────────────
  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const activeGoals = db.select().from(goals)
    .where(eq(goals.quarter, viewedQ))
    .all()
    .filter(g => g.status === 'active');

  const hasData = activeGoals.length > 0;

  const quarterInputs = db.select().from(inputs)
    .where(and(gte(inputs.date, bounds.start), lte(inputs.date, asOf)))
    .all();

  const latestScore = db.select().from(scores)
    .where(and(gte(scores.date, bounds.start), lte(scores.date, asOf)))
    .orderBy(asc(scores.date))
    .all()
    .at(-1) ?? null;

  const goalCards = activeGoals.map(g => {
    const goalInputs = quarterInputs.filter(i =>
      i.goalId === g.id || (i.goalId === null && i.vectorId === g.vectorId)
    );
    const c = computeCompletion(
      {
        type:             g.type as 'milestone' | 'metric' | 'consistency',
        trackabilityTier: g.trackabilityTier,
        proxyModel:       g.proxyModel,
        startDate:        g.startDate,
        endDate:          g.endDate,
        cadencePerWeek:   g.cadencePerWeek,
        startValue:       g.startValue,
        targetValue:      g.targetValue,
      },
      goalInputs.map(i => ({
        kind:          i.kind,
        progressDelta: i.progressDelta,
        value:         i.value,
        occurredCount: i.occurredCount,
        durationMin:   i.durationMin,
        confidence:    i.confidence,
        date:          i.date,
      })),
      asOf,
    );
    const gTau = goalTau(g.startDate, g.endDate, asOf);
    const e    = expectedPace(gTau, g.paceShape, g.paceParam);
    return { ...g, c, e, gap: c - e };
  });

  // τ is live for current quarter; 1 (complete) for historical
  const tau = isCurrentQ ? quarterPaceNow() : 1;

  const endMs   = new Date(bounds.end + 'T23:59:59').getTime();
  const daysLeft = isCurrentQ
    ? Math.max(0, Math.ceil((endMs - now.getTime()) / 86_400_000))
    : 0;

  // Navigation: previous always exists; next only if it's not in the future
  const prevQ = prevQuarterOf(viewedQ);
  const nextQ = nextQuarterOf(viewedQ);
  const nextQAfterCurrent = nextQ > currentQ;

  // ── Past quarters data (for the popover) ──────────────────────────────────
  const pastQuarters: PastQuarterEntry[] = [];
  {
    const olCache = new Map<string, number | null>();
    const getLastOl = (q: string): number | null => {
      if (olCache.has(q)) return olCache.get(q) ?? null;
      const b = quarterBounds(q);
      const rows = db.select().from(scores)
        .where(and(gte(scores.date, b.start), lte(scores.date, b.end)))
        .orderBy(asc(scores.date))
        .all();
      const val = rows.length > 0 ? rows[rows.length - 1].operatingLevel : null;
      olCache.set(q, val);
      return val;
    };

    let pq = prevQuarterOf(currentQ);
    for (let i = 0; i < 8; i++) {
      const olLast = getLastOl(pq);
      if (olLast == null) { pq = prevQuarterOf(pq); continue; }

      const prevOlLast = getLastOl(prevQuarterOf(pq));
      const olDelta = prevOlLast != null ? Math.round(olLast) - Math.round(prevOlLast) : null;

      // Summary from the quarter_review session stored against the next quarter
      const reviewSess = db.select().from(sessions)
        .where(and(
          eq(sessions.type, 'quarter_review'),
          eq(sessions.quarter, nextQuarterOf(pq)),
        ))
        .get();
      let summary: string | null = null;
      if (reviewSess?.report) {
        try {
          const rep = reviewSess.report as unknown as QuarterReport;
          const vd = rep.vectors?.filter(v => v.avgGap != null) ?? [];
          if (vd.length >= 2) {
            const sorted = [...vd].sort((a, b) => (b.avgGap ?? 0) - (a.avgGap ?? 0));
            const best  = sorted[0];
            const worst = sorted[sorted.length - 1];
            summary = (worst.avgGap ?? 0) < -0.05
              ? `${best.label} led · ${worst.label} slipped`
              : `${best.label} led`;
          }
        } catch { /* ignore malformed report */ }
      }

      pastQuarters.push({ quarter: pq, olLast, olDelta, summary });
      pq = prevQuarterOf(pq);
    }
  }

  return (
    <QuarterShell
      user={u}
      vectors={vecs}
      goalCards={goalCards}
      latestScore={latestScore}
      quarter={viewedQ}
      currentQuarter={currentQ}
      prevQuarter={prevQ}
      nextQuarter={nextQAfterCurrent ? null : nextQ}
      tau={tau}
      quarterStart={startLabel}
      quarterEnd={endLabel}
      quarterIsoStart={bounds.start}
      daysLeft={daysLeft}
      hasData={hasData}
      reviewPending={reviewPending}
      closedQuarter={closedQ}
      pastQuarters={pastQuarters}
    />
  );
}
