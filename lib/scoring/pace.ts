// Stage 2 helpers: τ, expected pace, and quarter-level pace

const DEFAULT_PACE_PARAM = 2;

export function goalTau(
  startDate: string | null,
  endDate:   string | null,
  asOf:      string,
): number {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate + 'T00:00:00').getTime();
  const e = new Date(endDate   + 'T00:00:00').getTime();
  const a = new Date(asOf      + 'T00:00:00').getTime();
  return Math.min(Math.max((a - s) / (e - s), 0), 1);
}

export function quarterPaceNow(): number {
  const now    = new Date();
  const q      = Math.ceil((now.getMonth() + 1) / 3);
  const qStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
  const qEnd   = new Date(now.getFullYear(), q * 3, 0);
  return Math.min(Math.max(
    (now.getTime() - qStart.getTime()) / (qEnd.getTime() - qStart.getTime()),
    0, 1,
  ), 1);
}

export function expectedPace(
  tau:       number,
  paceShape: string | null,
  paceParam: number | null,
): number {
  const k = paceParam ?? DEFAULT_PACE_PARAM;
  switch (paceShape) {
    case 'easeIn':  return Math.pow(tau, k);
    case 'easeOut': return 1 - Math.pow(1 - tau, k);
    case 'sCurve': {
      // Normalised logistic so e(0)=0, e(1)=1
      const raw   = 1 / (1 + Math.exp(-k * (tau - 0.5)));
      const at0   = 1 / (1 + Math.exp( k * 0.5));
      const at1   = 1 / (1 + Math.exp(-k * 0.5));
      return (raw - at0) / (at1 - at0);
    }
    default:        return tau;   // linear
  }
}
