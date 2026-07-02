// Stage 4: alignment penalty

import { ALIGN_LAMBDA, ALIGN_WINDOW_DAYS } from './constants';

type InputForAlignment = {
  date:        string;
  vectorId:    string | null;
  goalId:      string | null;
  durationMin: number | null;
};

export function computeAlignment(
  inputs:     InputForAlignment[],
  asOf:       string,
  windowDays: number = ALIGN_WINDOW_DAYS,
): { a: number; p: number } {
  const asOfMs      = new Date(asOf + 'T00:00:00').getTime();
  const windowStart = new Date(asOfMs - windowDays * 86_400_000);
  const windowStr   = windowStart.toISOString().split('T')[0];

  const recent = inputs.filter(i => i.date >= windowStr && i.date <= asOf);
  if (recent.length === 0) return { a: 1, p: 0 };

  let alignedEffort   = 0;
  let unalignedEffort = 0;

  for (const i of recent) {
    const effort = i.durationMin ?? 1;
    if (i.vectorId || i.goalId) {
      alignedEffort   += effort;
    } else {
      unalignedEffort += effort;
    }
  }

  const total = alignedEffort + unalignedEffort;
  const a = total > 0 ? alignedEffort / total : 1;
  const p = ALIGN_LAMBDA * (1 - a);

  return { a, p };
}
