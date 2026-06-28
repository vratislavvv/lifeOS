import { redirect } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, scores } from '@/lib/db/schema';
import { quarterPaceNow } from '@/lib/scoring/compute';
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

  return (
    <TodayShell
      user={u}
      vectors={vecs}
      goals={quarterGoals}
      score={latestScore}
      currentQuarter={quarter}
      quarterPace={quarterPaceNow()}
    />
  );
}
