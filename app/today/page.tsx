import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, inputs, scores, tasks, taskGroups } from '@/lib/db/schema';
import { quarterPaceNow, goalTau, expectedPace } from '@/lib/scoring/pace';
import { computeCompletion } from '@/lib/scoring/completion';
import { quarterBounds } from '@/lib/dates';
import TodayShell from './TodayShell';

export const dynamic = 'force-dynamic';

export default function TodayPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const today = now.toISOString().split('T')[0];
  const latestScore = db.select().from(scores)
    .where(eq(scores.date, today))
    .orderBy(desc(scores.createdAt))
    .get() ?? null;

  // Remove done tasks from previous days
  db.delete(tasks).where(and(lt(tasks.date, today), eq(tasks.done, true))).run();

  const groups = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const todayTasks = db.select().from(tasks)
    .where(and(
      eq(tasks.date, today),
      or(isNull(tasks.dueDate), lte(tasks.dueDate, today)),
    ))
    .orderBy(asc(tasks.createdAt))
    .all();

  // Quarter widget: compute actual completion per vector from goals + inputs
  const bounds = quarterBounds(quarter);
  const activeGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'active')))
    .all();
  const quarterInputs = db.select().from(inputs)
    .where(and(gte(inputs.date, bounds.start), lte(inputs.date, today)))
    .all();

  const vectorCompletion: Record<string, { c: number; e: number }> = {};
  for (const v of vecs) {
    const vGoals = activeGoals.filter(g => g.vectorId === v.id);
    if (vGoals.length === 0) continue;
    let sumC = 0, sumE = 0;
    for (const g of vGoals) {
      const gInputs = quarterInputs.filter(i => i.goalId === g.id || (i.goalId === null && i.vectorId === g.vectorId));
      sumC += computeCompletion(
        { type: g.type as 'milestone'|'metric'|'consistency', trackabilityTier: g.trackabilityTier, proxyModel: g.proxyModel, startDate: g.startDate, endDate: g.endDate, cadencePerWeek: g.cadencePerWeek, startValue: g.startValue, targetValue: g.targetValue },
        gInputs.map(i => ({ kind: i.kind, progressDelta: i.progressDelta, value: i.value, occurredCount: i.occurredCount, durationMin: i.durationMin, confidence: i.confidence, date: i.date })),
        today,
      );
      sumE += expectedPace(goalTau(g.startDate, g.endDate, today), g.paceShape, g.paceParam);
    }
    vectorCompletion[v.id] = { c: sumC / vGoals.length, e: sumE / vGoals.length };
  }

  return (
    <TodayShell
      user={u}
      vectors={vecs}
      score={latestScore}
      groups={groups}
      todayTasks={todayTasks}
      currentQuarter={quarter}
      quarterPace={quarterPaceNow()}
      vectorCompletion={vectorCompletion}
    />
  );
}
