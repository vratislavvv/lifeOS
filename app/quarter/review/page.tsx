import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, goals, sessions } from '@/lib/db/schema';
import { computeQuarterReport } from '@/lib/scoring/quarterReport';
import { prevQuarterOf, nextQuarterOf, quarterBounds, todayStr } from '@/lib/dates';
import ReviewSession from '../ReviewSession';

export const dynamic = 'force-dynamic';

export default function ReviewPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const today          = todayStr();
  const now            = new Date();
  const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const closedQuarter  = prevQuarterOf(currentQuarter);
  const prevEnd        = quarterBounds(closedQuarter).end;

  // Only show the review page if we're actually past the previous quarter
  if (today <= prevEnd) redirect('/quarter');

  // Find or create the open review session for the current quarter
  let session = db.select().from(sessions)
    .where(and(
      eq(sessions.type, 'quarter_review'),
      eq(sessions.quarter, currentQuarter),
      eq(sessions.status, 'open'),
    ))
    .get();

  if (!session) {
    const report = computeQuarterReport(closedQuarter);
    session = db.insert(sessions).values({
      type:    'quarter_review',
      quarter: currentQuarter,
      status:  'open',
      phase:   'report',
      report:  report as unknown as string,
    }).returning().get();
  }

  const report = session.report as ReturnType<typeof computeQuarterReport>;

  const allVectors = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  const existingDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'draft')))
    .all();

  return (
    <ReviewSession
      user={u}
      vectors={allVectors}
      sessionId={session.id}
      closedQuarter={closedQuarter}
      nextQuarter={currentQuarter}
      phase={session.phase}
      report={report}
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
