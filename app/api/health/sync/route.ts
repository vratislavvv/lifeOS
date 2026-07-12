import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user, healthData } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const u = db.select({ healthSyncToken: user.healthSyncToken }).from(user).limit(1).get();
  if (!u?.healthSyncToken || u.healthSyncToken !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const steps = typeof b.steps === 'number' ? Math.round(b.steps) : null;
  if (steps == null || steps < 0) return NextResponse.json({ error: 'Invalid steps' }, { status: 400 });

  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
    ? b.date
    : new Date().toLocaleDateString('en-CA');

  const now = new Date().toISOString();
  db.insert(healthData)
    .values({ date, steps, updatedAt: now })
    .onConflictDoUpdate({ target: healthData.date, set: { steps, updatedAt: now } })
    .run();

  return NextResponse.json({ ok: true, date, steps });
}
