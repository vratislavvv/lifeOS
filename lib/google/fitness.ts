import { getAccessToken } from './oauth';

async function fetchFromApi(refreshToken: string, dateStr: string): Promise<number> {
  const accessToken = await getAccessToken(refreshToken);
  const [y, m, d] = dateStr.split('-').map(Number);
  const tmrw = new Date(y, m - 1, d + 1);

  const resp = await fetch(
    'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        range: {
          start: { date: { year: y, month: m, day: d } },
          end:   { date: { year: tmrw.getFullYear(), month: tmrw.getMonth() + 1, day: tmrw.getDate() } },
        },
        windowSizeDays: 1,
      }),
    },
  );

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();

  let steps = 0;
  for (const point of data.rollupDataPoints ?? []) {
    steps += parseInt(point.steps?.countSum ?? '0', 10);
  }
  return steps;
}

// Fetches today's steps from the DB cache. If no row for today exists, hits the
// Google Health API, persists the result, then returns it.
export async function syncTodaySteps(
  refreshToken: string,
  today: string,              // YYYY-MM-DD in user's timezone
): Promise<number> {
  // Inline DB import to keep this module usable outside the Next.js server context.
  const { db }         = await import('@/lib/db');
  const { healthData } = await import('@/lib/db/schema');
  const { eq }         = await import('drizzle-orm');

  const cached = db.select().from(healthData).where(eq(healthData.date, today)).get();
  if (cached?.steps != null) return cached.steps;

  const steps = await fetchFromApi(refreshToken, today);

  db.insert(healthData)
    .values({ date: today, steps, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: healthData.date, set: { steps, updatedAt: new Date().toISOString() } })
    .run();

  return steps;
}
