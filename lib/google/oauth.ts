const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
    scope:         [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    ].join(' '),
    response_type: 'code',
    access_type:   'offline',
    prompt:        'consent',
  });
  if (state) params.set('state', state);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export function getGoogleHealthAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  process.env.GOOGLE_HEALTH_REDIRECT_URI!,
    scope:         'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    response_type: 'code',
    access_type:   'offline',
    prompt:        'consent',
  });
  if (state) params.set('state', state);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function exchangeCode(code: string, redirectUri: string): Promise<{ refresh_token: string }> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  if (!data.refresh_token) throw new Error('No refresh_token in response — ensure prompt=consent was passed.');
  return data;
}

export function exchangeCodeForTokens(code: string) {
  return exchangeCode(code, process.env.GOOGLE_REDIRECT_URI!);
}

export function exchangeCodeForHealthTokens(code: string) {
  return exchangeCode(code, process.env.GOOGLE_HEALTH_REDIRECT_URI!);
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  return data.access_token;
}
