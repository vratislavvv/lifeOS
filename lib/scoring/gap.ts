// Stage 3: goal gap and vector gap (with staleness decay)

import { STALE_GRACE, STALE_RATE, STALE_CAP } from './constants';

export function goalGap(c: number, e: number): number {
  return c - e;
}

type GoalResult = {
  type:   string;
  c:      number;
  e:      number;
  weight: number;
};

export function vectorGap(
  goals:         GoalResult[],
  lastInputDate: string | null,
  asOf:          string,
): number {
  if (goals.length === 0) return 0;

  const totalWeight = goals.reduce((s, g) => s + g.weight, 0);
  const weightedGap = goals.reduce((s, g) => s + g.weight * goalGap(g.c, g.e), 0);
  let Γ = totalWeight > 0 ? weightedGap / totalWeight : 0;

  // Staleness decay applies only to metric/milestone goals (consistency self-registers neglect).
  const needsDecay = goals.some(g => g.type === 'metric' || g.type === 'milestone');
  if (needsDecay && lastInputDate) {
    const asOfMs  = new Date(asOf          + 'T00:00:00').getTime();
    const lastMs  = new Date(lastInputDate + 'T00:00:00').getTime();
    const daysStale = Math.max((asOfMs - lastMs) / 86_400_000, 0);
    const staleness = STALE_RATE * Math.max(0, daysStale - STALE_GRACE);
    Γ -= Math.min(staleness, STALE_CAP);
  }

  return Γ;
}
