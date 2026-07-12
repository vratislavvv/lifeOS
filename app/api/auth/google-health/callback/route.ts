import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { exchangeCodeForHealthTokens } from '@/lib/google/oauth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state') ?? undefined;  // 'setup' | undefined

  const fromSetup = state === 'setup';

  if (error || !code) {
    const dest = fromSetup ? '/setup' : '/settings?section=connections&error=oauth_cancelled';
    return NextResponse.redirect(new URL(dest, origin));
  }

  try {
    const tokens = await exchangeCodeForHealthTokens(code);
    db.update(user).set({
      googleHealthRefreshToken: tokens.refresh_token,
      googleHealthConnectedAt:  new Date().toISOString(),
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
