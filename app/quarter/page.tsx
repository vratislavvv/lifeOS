import { redirect } from 'next/navigation';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, scores, inputs, sessions } from '@/lib/db/schema';
import { quarterPaceNow, goalTau, expectedPace } from '@/lib/scoring/pace';
import { computeCompletion } from '@/lib/scoring/completion';
import { quarterBounds, prevQuarterOf, todayStr } from '@/lib/dates';
import QuarterShell from './QuarterShell';

export const dynamic = 'force-dynamic';


export default function QuarterPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now     = new Date();
  const today   = todayStr();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const bounds  = quarterBounds(quarter);
  const tau     = quarterPaceNow();

  const [qYear, qMon] = [parseInt(quarter.split('-Q')[0]), (parseInt(quarter.split('-Q')[1]) - 1) * 3];
  const startLabel = new Date(qYear, qMon, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel   = new Date(qYear, qMon + 3, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Detect if a quarter review is due
  const closedQuarter = prevQuarterOf(quarter);
  const prevEnd = quarterBounds(closedQuarter).end;
  const reviewDue = today > prevEnd;

  // Check whether there's already an open or complete review for this quarter
  const existingReview = reviewDue
    ? db.select().from(sessions)
        .where(and(
          eq(sessions.type, 'quarter_review'),
          eq(sessions.quarter, quarter),
        ))
        .get()
    : null;

  const reviewPending = reviewDue && (!existingReview || existingReview.status === 'open');

  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const activeGoals = db.select().from(goals)
    .where(eq(goals.quarter, quarter))
    .all()
    .filter(g => g.status === 'active');

  const quarterInputs = db.select().from(inputs)
    .where(and(gte(inputs.date, bounds.start), lte(inputs.date, today)))
    .all();

  const scoreTrend = db.select().from(scores)
    .where(gte(scores.date, bounds.start))
    .orderBy(asc(scores.date))
    .all();

  const latestScore = scoreTrend.at(-1) ?? null;

  const goalCards = activeGoals.map(g => {
    // Inputs for this goal: exact match first, then untagged vector-level inputs
    const goalInputs = quarterInputs.filter(i =>
      i.goalId === g.id || (i.goalId === null && i.vectorId === g.vectorId)
    );
    const c = computeCompletion(
      {
        type:           g.type as 'milestone' | 'metric' | 'consistency',
        startDate:      g.startDate,
        cadencePerWeek: g.cadencePerWeek,
        startValue:     g.startValue,
        targetValue:    g.targetValue,
      },
      goalInputs.map(i => ({
        kind:          i.kind,
        progressDelta: i.progressDelta,
        value:         i.value,
        occurredCount: i.occurredCount,
        confidence:    i.confidence,
        date:          i.date,
      })),
      today,
    );
    const gTau = goalTau(g.startDate, g.endDate, today);
    const e    = expectedPace(gTau, g.paceShape, g.paceParam);
    return { ...g, c, e, gap: c - e };
  });

  const endMs   = new Date(bounds.end + 'T23:59:59').getTime();
  const daysLeft = Math.max(0, Math.ceil((endMs - now.getTime()) / 86_400_000));

  return (
    <QuarterShell
      user={u}
      vectors={vecs}
      goalCards={goalCards}
      scoreTrend={scoreTrend.map(s => ({ date: s.date, ol: s.operatingLevel }))}
      latestScore={latestScore}
      quarter={quarter}
      tau={tau}
      quarterStart={startLabel}
      quarterEnd={endLabel}
      daysLeft={daysLeft}
      reviewPending={reviewPending}
      closedQuarter={closedQuarter}
    />
  );
}
