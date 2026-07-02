// Stage 6: EMA smoothing

import { EMA_ALPHA } from './constants';

export function emaSmooth(
  raw:   number,
  prev:  number | null,
  alpha: number = EMA_ALPHA,
): number {
  if (prev == null) return raw;
  return alpha * raw + (1 - alpha) * prev;
}
