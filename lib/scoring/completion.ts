// Stage 1: completion c ∈ [0,1] by goal type

import { MAX_INPUT_DELTA, CONFIDENCE_FLOOR } from './constants';

export type GoalForCompletion = {
  type:           'milestone' | 'metric' | 'consistency';
  startDate:      string | null;
  cadencePerWeek: number | null;
  startValue:     number | null;
  targetValue:    number | null;
};

export type InputForCompletion = {
  kind:          string | null;
  progressDelta: number | null;
  value:         number | null;
  occurredCount: number | null;
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
      return metricCompletion(goal, inputs);

    case 'consistency':
      return consistencyCompletion(goal, inputs, asOf);

    case 'milestone':
      return milestoneCompletion(inputs);
  }
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
