import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, sessions } from '@/lib/db/schema';
import ReplanSession from '../ReplanSession';

export const dynamic = 'force-dynamic';

export default function ReplanPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now            = new Date();
  const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  // Resume open session or create a new one
  let session = db.select().from(sessions)
    .where(and(
      eq(sessions.type, 'replan_ondemand'),
      eq(sessions.quarter, currentQuarter),
      eq(sessions.status, 'open'),
    ))
    .get();

  if (!session) {
    session = db.insert(sessions).values({
      type:    'replan_ondemand',
      quarter: currentQuarter,
      status:  'open',
      phase:   'discuss',
    }).returning().get();
  }

  const allVectors = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const activeGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'active')))
    .all();

  const existingDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'draft')))
    .all();

  return (
    <ReplanSession
      user={u}
      vectors={allVectors}
      sessionId={session.id}
      currentQuarter={currentQuarter}
      phase={session.phase}
      activeGoals={activeGoals.map(g => ({
        id:          g.id,
        vectorId:    g.vectorId,
        description: g.description,
        type:        g.type,
      }))}
      existingDraftGoals={existingDraftGoals.map(g => ({
        id:             g.id,
        vectorId:       g.vectorId,
        description:    g.description,
        type:           g.type,
        startValue:     g.startValue,
        targetValue:    g.targetValue,
        cadencePerWeek: g.cadencePerWeek,
        paceShape:      g.paceShape,
      }))}
    />
  );
}
