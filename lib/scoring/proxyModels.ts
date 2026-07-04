// Deterministic proxy models used when trackabilityTier = 'proxy'.
// Each model exposes: a projection function and its calibrated confidence.

// Riegel formula: projects race time at targetDist from a known effort at knownDist.
// Well-validated for distances ≥ 5 km. Confidence 0.85.
export function riegelProjection(
  knownTime:    number, // seconds
  knownDist:    number, // metres
  targetDist:   number, // metres
): number {
  return knownTime * Math.pow(targetDist / knownDist, 1.06);
}

export const PROXY_CONFIDENCE: Record<string, number> = {
  riegel: 0.85,
};

// Completion for a proxy-metric goal:
// c = (startProjection − currentProjection) / (startProjection − targetProjection)
// Clamped 0–1. currentProjection comes from riegelProjection over recent inputs.
export function proxyMetricCompletion(
  startProjection:   number,
  currentProjection: number,
  targetProjection:  number,
): number {
  const range = startProjection - targetProjection;
  if (range === 0) return currentProjection <= targetProjection ? 1 : 0;
  return Math.min(Math.max((startProjection - currentProjection) / range, 0), 1);
}
