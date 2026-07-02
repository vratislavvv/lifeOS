import { redirect } from 'next/navigation';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, scores, tasks, taskGroups } from '@/lib/db/schema';
import { quarterPaceNow } from '@/lib/scoring/pace';
import TodayShell from './TodayShell';

export const dynamic = 'force-dynamic';

export default function TodayPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const vecs = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const quarterGoals = db.select().from(goals).where(eq(goals.quarter, quarter)).all();

  const today = now.toISOString().split('T')[0];
  const latestScore = db.select().from(scores)
    .where(eq(scores.date, today))
    .orderBy(desc(scores.createdAt))
    .get() ?? null;

  // Remove done tasks from previous days
  db.delete(tasks).where(and(lt(tasks.date, today), eq(tasks.done, true))).run();

  const groups = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const todayTasks = db.select().from(tasks)
    .where(eq(tasks.date, today))
    .orderBy(asc(tasks.createdAt))
    .all();

  return (
    <TodayShell
      user={u}
      vectors={vecs}
      goals={quarterGoals}
      score={latestScore}
      groups={groups}
      todayTasks={todayTasks}
      currentQuarter={quarter}
      quarterPace={quarterPaceNow()}
    />
  );
}
