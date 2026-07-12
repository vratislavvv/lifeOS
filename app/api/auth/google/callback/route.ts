import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { exchangeCodeForTokens } from '@/lib/google/oauth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state') ?? undefined;

  const fromSetup = state === 'setup';

  if (error || !code) {
    const dest = fromSetup ? '/setup' : '/settings?section=connections&error=oauth_cancelled';
    return NextResponse.redirect(new URL(dest, origin));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const now = new Date().toISOString();
    // Upsert: during setup the user row may not exist yet (created at step 4).
    // Insert a placeholder row so tokens are persisted; startSetupSession later fills real values.
    db.insert(user).values({
      id:                       1,
      name:                     '',
      timezone:                 'UTC',
      googleRefreshToken:       tokens.refresh_token,
      googleConnectedAt:        now,
      googleHealthRefreshToken: tokens.refresh_token,
      googleHealthConnectedAt:  now,
    }).onConflictDoUpdate({
      target: user.id,
      set: {
        googleRefreshToken:       tokens.refresh_token,
        googleConnectedAt:        now,
        googleHealthRefreshToken: tokens.refresh_token,
        googleHealthConnectedAt:  now,
      },
    }).run();
    revalidatePath('/settings');
    revalidatePath('/today');
    const dest = fromSetup ? '/setup' : '/settings?section=connections';
    return NextResponse.redirect(new URL(dest, origin));
  } catch {
    const dest = fromSetup ? '/setup' : '/settings?section=connections&error=oauth_failed';
    return NextResponse.redirect(new URL(dest, origin));
  }
}
