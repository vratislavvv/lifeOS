import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google/oauth';

export function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? undefined;
  return NextResponse.redirect(getGoogleAuthUrl(from));
}
