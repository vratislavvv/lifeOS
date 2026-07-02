// Stage 5: composite G → raw score S ∈ [0,100]

import { ON_PACE_SCORE } from './constants';

export function compositeGap(
  vectorGaps: { gap: number; weight: number }[],
  alignmentPenalty: number,
): number {
  if (vectorGaps.length === 0) return -alignmentPenalty;
  const totalWeight  = vectorGaps.reduce((s, v) => s + v.weight, 0);
  const weightedSum  = vectorGaps.reduce((s, v) => s + v.weight * v.gap, 0);
  const G0           = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return G0 - alignmentPenalty;
}

export function rawScore(G: number): number {
  let S: number;
  if (G >= 0) {
    S = ON_PACE_SCORE + (100 - ON_PACE_SCORE) * G;
  } else {
    S = ON_PACE_SCORE + ON_PACE_SCORE * G;
  }
  return Math.min(Math.max(S, 0), 100);
}
