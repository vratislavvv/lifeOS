import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, inputs, scores, tasks, taskGroups } from '@/lib/db/schema';
import { quarterPaceNow, goalTau, expectedPace } from '@/lib/scoring/pace';
import { computeCompletion } from '@/lib/scoring/completion';
import { quarterBounds } from '@/lib/dates';
import { fetchCalendarEvents, type CalEvent } from '@/lib/google/calendar';
import { syncTodaySteps } from '@/lib/google/fitness';
import TodayShell from './TodayShell';
import type { LogEntry } from './CalSection';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const now = new Date();
  const tz = u.timezone ?? 'UTC';
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const quarter = `${todayYear}-Q${Math.ceil(todayMonth / 3)}`;
  const latestScore = db.select().from(scores)
    .where(eq(scores.date, today))
    .orderBy(desc(scores.createdAt))
    .get() ?? null;

  // Remove done tasks from previous days
  db.delete(tasks).where(and(lt(tasks.date, today), eq(tasks.done, true))).run();

  const groups = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const todayTasks = db.select().from(tasks)
    .where(or(
      // Tasks added today with no future due date
      and(
        eq(tasks.date, today),
        or(isNull(tasks.dueDate), lte(tasks.dueDate, today)),
      ),
      // Overdue undone tasks from any previous day
      and(
        lt(tasks.dueDate, today),
        eq(tasks.done, false),
      ),
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

  // Build log entries for calendar dots — all inputs this quarter with vector color
  const logEntries: LogEntry[] = quarterInputs
    .filter(i => i.vectorId)
    .map(i => {
      const vec = vecs.find(v => v.id === i.vectorId);
      if (!vec) return null;
      const createdAt = i.createdAt ? new Date(i.createdAt) : null;
      const time = createdAt
        ? createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
        : '';
      return {
        id:          i.id,
        date:        i.date,
        time,
        description: (i.metadata as { summary?: string } | null)?.summary ?? i.rawText ?? '',
        vectorColor: vec.color,
        vectorLabel: vec.label,
      };
    })
    .filter((e): e is LogEntry => e !== null);

  let todaySteps: number | undefined;
  let calEvents: CalEvent[] = [];

  const fetches = await Promise.allSettled([
    u.googleHealthRefreshToken ? syncTodaySteps(u.googleHealthRefreshToken, today) : Promise.reject('no health token'),
    u.googleRefreshToken ? fetchCalendarEvents(u.googleRefreshToken,
      new Date(Date.now() - 7  * 86_400_000),
      new Date(Date.now() + 90 * 86_400_000),
    ) : Promise.reject('no calendar token'),
  ]);
  if (fetches[0].status === 'fulfilled') todaySteps = fetches[0].value;
  if (fetches[1].status === 'fulfilled') calEvents  = fetches[1].value;

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
      calEvents={calEvents}
      logEntries={logEntries}
      todaySteps={todaySteps}
    />
  );
}
