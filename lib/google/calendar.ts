import { getAccessToken } from './oauth';

export type CalEvent = {
  id:     string;
  title:  string;
  start:  string; // YYYY-MM-DD for all-day, ISO dateTime for timed
  end:    string;
  allDay: boolean;
};

export async function fetchCalendarEvents(
  refreshToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalEvent[]> {
  const accessToken = await getAccessToken(refreshToken);
  const params = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '500',
  });
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
  );
  if (!resp.ok) throw new Error(`Calendar API ${resp.status}`);
  const data = await resp.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => {
    const start = item.start as Record<string, string>;
    const end   = item.end   as Record<string, string>;
    const allDay = !!start.date;
    return {
      id:     item.id as string,
      title:  (item.summary as string) ?? '(no title)',
      start:  start.date ?? start.dateTime,
      end:    end.date   ?? end.dateTime,
      allDay,
    };
  });
}

export function eventsOnDate(events: CalEvent[], d: Date): CalEvent[] {
  const ds = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  return events.filter(e => {
    if (e.allDay) {
      // Google's end date for all-day events is exclusive
      return e.start <= ds && ds < e.end;
    }
    return e.start.slice(0, 10) === ds;
  });
}
