import { redirect } from 'next/navigation';
import { asc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, scores, inputs } from '@/lib/db/schema';
import { quarterPaceNow } from '@/lib/scoring/compute';
import QuarterShell from './QuarterShell';

export const dynamic = 'force-dynamic';

function quarterBounds(quarter: string) {
  const [yearStr, qStr] = quarter.split('-Q');
  const year = parseInt(yearStr);
  const q = parseInt(qStr);
  const sm = (q - 1) * 3;
  const start = new Date(year, sm, 1);
  const end   = new Date(year, sm + 3, 0);
  return {
    startDate:  start.toISOString().split('T')[0],
    endDate:    end.toISOString().split('T')[0],
    startLabel: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    endLabel:   end.toLocaleDateString('en-US',   { month: 'short', day: 'numeric' }),
  };
}

function goalCompletion(
  goalId: string,
  vectorId: string,
  siblingsCount: number,
  ins: { goalId: string | null; vectorId: string | null; progressDelta: number | null }[]
): number {
  const exact = ins.filter(i => i.goalId === goalId);
  if (exact.length > 0) {
    return Math.min(exact.reduce((s, i) => s + (i.progressDelta ?? 0), 0), 1);
  }
  const vec = ins.filter(i => i.goalId === null && i.vectorId === vectorId);
  return Math.min(vec.reduce((s, i) => s + (i.progressDelta ?? 0), 0) / Math.max(siblingsCount, 1), 1);
}

export default function QuarterPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now     = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const bounds  = quarterBounds(quarter);
  const tau     = quarterPaceNow();

  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const activeGoals = db.select().from(goals)
    .where(eq(goals.quarter, quarter))
    .all()
    .filter(g => g.status === 'active');

  const quarterInputs = db.select().from(inputs)
    .where(gte(inputs.date, bounds.startDate))
    .all();

  const scoreTrend = db.select().from(scores)
    .where(gte(scores.date, bounds.startDate))
    .orderBy(asc(scores.date))
    .all();

  const latestScore = scoreTrend.at(-1) ?? null;

  const goalCards = activeGoals.map(g => {
    const siblings = activeGoals.filter(ag => ag.vectorId === g.vectorId).length;
    const c = goalCompletion(g.id, g.vectorId, siblings, quarterInputs);
    const e = tau;
    return { ...g, c, e, gap: c - e };
  });

  const endMs   = new Date(bounds.endDate + 'T23:59:59').getTime();
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
      quarterStart={bounds.startLabel}
      quarterEnd={bounds.endLabel}
      daysLeft={daysLeft}
    />
  );
}
