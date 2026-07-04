// Stage 1: completion c ∈ [0,1] by goal type

import { MAX_INPUT_DELTA, CONFIDENCE_FLOOR } from './constants';
import { riegelProjection, proxyMetricCompletion } from './proxyModels';

export type GoalForCompletion = {
  type:              'milestone' | 'metric' | 'consistency';
  trackabilityTier?: string | null;
  proxyModel?:       string | null;
  startDate:         string | null;
  cadencePerWeek:    number | null;
  startValue:        number | null;
  targetValue:       number | null;
};

export type InputForCompletion = {
  kind:          string | null;
  progressDelta: number | null;
  value:         number | null;
  occurredCount: number | null;
  durationMin:   number | null;
  confidence:    number | null;
  date:          string;
};

export function computeCompletion(
  goal:   GoalForCompletion,
  inputs: InputForCompletion[],
  asOf:   string,
): number {
  switch (goal.type) {
    case 'metric':
      return goal.trackabilityTier === 'proxy' && goal.proxyModel != null
        ? proxyCompletion(goal, inputs)
        : metricCompletion(goal, inputs);

    case 'consistency':
      return consistencyCompletion(goal, inputs, asOf);

    case 'milestone':
      return milestoneCompletion(inputs);
  }
}

// proxyModel format: "riegel" (defaults to marathon 42.195 km)
//                 or "riegel:<target_dist_km>" for other events (e.g. "riegel:5", "riegel:21.098")
// Inputs need value = distance (km) and durationMin = time (minutes) on kind=metric_value.
// startValue and targetValue are both projected event times in minutes.
function proxyCompletion(
  goal:   GoalForCompletion,
  inputs: InputForCompletion[],
): number {
  if (goal.startValue == null || goal.targetValue == null) return 0;

  const model = goal.proxyModel!;

  if (model.startsWith('riegel')) {
    const targetDist = model.includes(':') ? parseFloat(model.split(':')[1]) : 42.195;
    if (isNaN(targetDist) || targetDist <= 0) return 0;

    // Most recent effort that has both distance (value) and time (durationMin)
    const effort = inputs
      .filter(i => i.kind === 'metric_value' && i.value != null && i.durationMin != null && i.durationMin > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (!effort) return 0;

    const projectedSecs = riegelProjection(effort.durationMin! * 60, effort.value!, targetDist);
    const projectedMins = projectedSecs / 60;

    return proxyMetricCompletion(goal.startValue, projectedMins, goal.targetValue);
  }

  return 0;
}

function metricCompletion(
  goal:   Pick<GoalForCompletion, 'startValue' | 'targetValue'>,
  inputs: InputForCompletion[],
): number {
  const { startValue: s, targetValue: t } = goal;
  if (s == null || t == null || t === s) return 0;

  // Latest metric_value reading (most recent date, then highest confidence)
  const readings = inputs
    .filter(i => i.kind === 'metric_value' && i.value != null)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.confidence ?? 0) - (a.confidence ?? 0));

  if (readings.length === 0) return 0;
  const currentValue = readings[0].value!;
  return Math.min(Math.max((currentValue - s) / (t - s), 0), 1);
}

function consistencyCompletion(
  goal:   Pick<GoalForCompletion, 'startDate' | 'cadencePerWeek'>,
  inputs: InputForCompletion[],
  asOf:   string,
): number {
  if (!goal.cadencePerWeek || goal.cadencePerWeek <= 0) return 0;
  if (!goal.startDate) return 0;

  const startMs = new Date(goal.startDate + 'T00:00:00').getTime();
  const asOfMs  = new Date(asOf          + 'T00:00:00').getTime();
  const daysElapsed   = Math.max((asOfMs - startMs) / 86_400_000, 0);
  const weeksElapsed  = daysElapsed / 7;
  const scheduledPeriods = goal.cadencePerWeek * weeksElapsed;

  if (scheduledPeriods <= 0) return 0;

  // Accept typed consistency inputs; fall back to counting any untyped input as 1 occurrence
  const completedPeriods = inputs
    .filter(i => i.kind === 'consistency_occurrence' || i.kind == null)
    .reduce((s, i) => s + (i.occurredCount ?? 1), 0);

  return Math.min(completedPeriods / scheduledPeriods, 1);
}

function milestoneCompletion(inputs: InputForCompletion[]): number {
  // Accept typed milestone inputs; fall back to untyped inputs with a progressDelta
  const eligible = inputs.filter(i =>
    (i.kind === 'milestone_delta' || (i.kind == null && i.progressDelta != null)) &&
    (i.confidence ?? 1) >= CONFIDENCE_FLOOR
  );
  const total = eligible.reduce((sum, i) => {
    const delta = i.progressDelta ?? 0;
    const capped = Math.sign(delta) * Math.min(Math.abs(delta), MAX_INPUT_DELTA);
    return sum + capped * (i.confidence ?? 1);
  }, 0);
  return Math.min(Math.max(total, 0), 1);
}
