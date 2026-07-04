import { redirect } from 'next/navigation';
import { and, asc, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, scores } from '@/lib/db/schema';
import { computeQuarterReport } from '@/lib/scoring/quarterReport';
import { prevQuarterOf, quarterBounds } from '@/lib/dates';
import ReplanSession from '../ReplanSession';

export const dynamic = 'force-dynamic';

export default function ReplanPage() {
  const u = db.select().from(user).get();
  if (!u || !u.setupDone) redirect('/setup');

  const now            = new Date();
  const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const closedQuarter  = prevQuarterOf(currentQuarter);

  // Score history for sparkline (closed quarter)
  const closedBounds  = quarterBounds(closedQuarter);
  const scoreHistory  = db.select().from(scores)
    .where(and(gte(scores.date, closedBounds.start), lte(scores.date, closedBounds.end)))
    .orderBy(asc(scores.date))
    .all()
    .map(s => ({ date: s.date, ol: s.operatingLevel }));

  if (scoreHistory.length === 0) redirect('/quarter');

  const report = computeQuarterReport(closedQuarter);

  // OL delta vs quarter before closed
  const prevQBounds = quarterBounds(prevQuarterOf(closedQuarter));
  const prevQScores = db.select().from(scores)
    .where(and(gte(scores.date, prevQBounds.start), lte(scores.date, prevQBounds.end)))
    .orderBy(asc(scores.date))
    .all();
  const prevOlLast = prevQScores.length > 0 ? prevQScores[prevQScores.length - 1].operatingLevel : null;
  const olDelta = report.olLast != null && prevOlLast != null
    ? Math.round(report.olLast) - Math.round(prevOlLast)
    : null;

  // Date labels
  const [cqYear, cqNum] = closedQuarter.split('-Q');
  const closedStart = new Date(parseInt(cqYear), (parseInt(cqNum) - 1) * 3, 1)
    .toLocaleDateString('en-US', { month: 'short' });
  const closedEnd = new Date(parseInt(cqYear), parseInt(cqNum) * 3, 0)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const allVectors = db.select().from(vectors).orderBy(asc(vectors.order)).all();

  return (
    <ReplanSession
      user={u}
      vectors={allVectors}
      report={report}
      scoreHistory={scoreHistory}
      olDelta={olDelta}
      closedStart={closedStart}
      closedEnd={closedEnd}
      closedQuarter={closedQuarter}
      currentQuarter={currentQuarter}
    />
  );
}
