// Shared date + quarter helpers used across server actions and scoring.

export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


export function quarterBounds(quarter: string): { start: string; end: string } {
  const [yearStr, qStr] = quarter.split('-Q');
  const year = parseInt(yearStr);
  const q    = parseInt(qStr);
  const sm   = (q - 1) * 3;
  const pad  = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(sm + 1)}-01`;
  const ed    = new Date(year, sm + 3, 0);
  const end   = `${ed.getFullYear()}-${pad(ed.getMonth() + 1)}-${pad(ed.getDate())}`;
  return { start, end };
}

export function prevQuarterOf(q: string): string {
  const [yearStr, qStr] = q.split('-Q');
  const year = parseInt(yearStr), qn = parseInt(qStr);
  return qn > 1 ? `${year}-Q${qn - 1}` : `${year - 1}-Q4`;
}

export function nextQuarterOf(q: string): string {
  const [yearStr, qStr] = q.split('-Q');
  const year = parseInt(yearStr), qn = parseInt(qStr);
  return qn < 4 ? `${year}-Q${qn + 1}` : `${year + 1}-Q1`;
}
