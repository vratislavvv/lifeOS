import { db } from '@/lib/db';
import { goals, inputs, scores, vectors } from '@/lib/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { expectedPace as sharedExpectedPace } from './pace';
import { MAX_INPUT_DELTA, CONFIDENCE_FLOOR } from './constants';
import { riegelProjection, proxyMetricCompletion } from './proxyModels';
import { quarterBounds as sharedQuarterBounds } from '@/lib/dates';

// ── Public types ──────────────────────────────────────────────────────────────

export type GoalReport = {
  goalId:           string;
  vectorId:         string;
  description:      string;
  type:             'milestone' | 'metric' | 'consistency';
  status:           string;
  c:                number;          // completion fraction 0..1
  e:                number;          // expected at asOf given paceShape
  gap:              number;          // c − e
  startValue:       number | null;
  targetValue:      number | null;
  finalValue:       number | null;   // last observed metric reading
  cadencePerWeek:   number | null;
  scheduledPeriods: number | null;
  completedPeriods: number | null;
};

export type VectorReport = {
  vectorId:      string;
  label:         string;
  color:         string;
  avgGap:        number | null;      // null when no active/completed goals
  goalCount:     number;
  inputCount:    number;
  lastInputDate: string | null;
};

export type QuarterReport = {
  quarter:      string;
  quarterStart: string;
  quarterEnd:   string;
  asOf:         string;
  tau:          number;
  // OL arc over the period
  olFirst:      number | null;
  olLast:       number | null;
  olHigh:       number | null;
  olLow:        number | null;
  // Detail
  goals:        GoalReport[];
  vectors:      VectorReport[];
  // Activity
  totalInputs:  number;
  daysActive:   number;             // distinct days with any input
  avgAlignment: number | null;
};

// ── Internal types ────────────────────────────────────────────────────────────

export type GoalRow   = typeof goals.$inferSelect;
export type InputRow  = typeof inputs.$inferSelect;
export type ScoreRow  = typeof scores.$inferSelect;
export type VectorRow = typeof vectors.$inferSelect;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function computeTau(start: string, end: string, asOf: string): number {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end   + 'T00:00:00').getTime();
  const a = new Date(asOf  + 'T00:00:00').getTime();
  return Math.min(Math.max((a - s) / (e - s), 0), 1);
}

// Collect inputs for a single goal: exact goalId match, or vector-level split by sibling count.
// siblingCount is the number of goals sharing the same vector (used only for the fallback path).
function collectGoalInputs(
  goal: GoalRow,
  allInputs: InputRow[],
  siblingCount: number,
): InputRow[] {
  const exact = allInputs.filter(i => i.goalId === goal.id);
  if (exact.length > 0) return exact;

  const vecLevel = allInputs.filter(i => i.goalId === null && i.vectorId === goal.vectorId);
  if (siblingCount <= 1) return vecLevel;

  // Split vector-level inputs evenly across goals in the vector
  return vecLevel.map(i => ({
    ...i,
    progressDelta: i.progressDelta != null ? i.progressDelta / siblingCount : null,
    occurredCount: i.occurredCount != null ? i.occurredCount / siblingCount : null,
    // metric value is not split — each goal reads the same observed number
  }));
}

type CResult = {
  c:                number;
  finalValue:       number | null;
  scheduledPeriods: number | null;
  completedPeriods: number | null;
};

function computeCompletion(goal: GoalRow, goalInputs: InputRow[], asOf: string): CResult {
  if (goal.type === 'metric') {
    if (goal.startValue == null || goal.targetValue == null) {
      return { c: 0, finalValue: null, scheduledPeriods: null, completedPeriods: null };
    }

    // Proxy branch: derive currentValue from the proxy model (e.g. Riegel)
    if (goal.trackabilityTier === 'proxy' && goal.proxyModel?.startsWith('riegel')) {
      const targetDist = goal.proxyModel.includes(':') ? parseFloat(goal.proxyModel.split(':')[1]) : 42.195;
      const effort = goalInputs
        .filter(i => i.kind === 'metric_value' && i.value != null && i.durationMin != null && i.durationMin > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!effort) return { c: 0, finalValue: null, scheduledPeriods: null, completedPeriods: null };
      const projectedMins = riegelProjection(effort.durationMin! * 60, effort.value!, targetDist) / 60;
      const c = proxyMetricCompletion(goal.startValue, projectedMins, goal.targetValue);
      return { c, finalValue: projectedMins, scheduledPeriods: null, completedPeriods: null };
    }

    const readings = goalInputs
      .filter(i => i.kind === 'metric_value' && i.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (readings.length === 0) {
      return { c: 0, finalValue: null, scheduledPeriods: null, completedPeriods: null };
    }
    const finalValue = readings[readings.length - 1].value!;
    const c = Math.min(Math.max(
      (finalValue - goal.startValue) / (goal.targetValue - goal.startValue), 0,
    ), 1);
    return { c, finalValue, scheduledPeriods: null, completedPeriods: null };
  }

  if (goal.type === 'consistency') {
    if (!goal.cadencePerWeek || !goal.startDate || !goal.endDate) {
      return { c: 0, finalValue: null, scheduledPeriods: null, completedPeriods: null };
    }
    const completedPeriods = goalInputs
      .filter(i => i.kind === 'consistency_occurrence')
      .reduce((sum, i) => sum + (i.occurredCount ?? 1), 0);
    const msPerWeek        = 7 * 24 * 60 * 60 * 1000;
    const quarterWeeks     = Math.max(
      (new Date(goal.endDate + 'T00:00:00').getTime() - new Date(goal.startDate + 'T00:00:00').getTime()) / msPerWeek,
      0,
    );
    const scheduledPeriods = goal.cadencePerWeek * quarterWeeks;
    const c = scheduledPeriods > 0 ? Math.min(completedPeriods / scheduledPeriods, 1) : 0;
    return { c, finalValue: null, scheduledPeriods, completedPeriods };
  }

  // milestone
  const c = Math.min(Math.max(
    goalInputs
      .filter(i => i.kind === 'milestone_delta' && (i.confidence ?? 1) >= CONFIDENCE_FLOOR)
      .reduce((sum, i) => {
        const capped = Math.min(Math.abs(i.progressDelta ?? 0), MAX_INPUT_DELTA)
                     * Math.sign(i.progressDelta ?? 1);
        return sum + capped * (i.confidence ?? 1);
      }, 0),
    0,
  ), 1);
  return { c, finalValue: null, scheduledPeriods: null, completedPeriods: null };
}

// ── Pure computation (testable without DB) ────────────────────────────────────

type ReportData = {
  quarter:    string;
  asOf:       string;
  allGoals:   GoalRow[];
  allInputs:  InputRow[];
  allScores:  ScoreRow[];
  allVectors: VectorRow[];
};

export function buildQuarterReport(data: ReportData): QuarterReport {
  const { quarter, asOf: reportAsOf, allGoals, allInputs, allVectors } = data;
  const allScores = [...data.allScores].sort((a, b) => a.date.localeCompare(b.date));

  const { start, end } = sharedQuarterBounds(quarter);
  const t = computeTau(start, end, reportAsOf);

  // ── Per-goal ──────────────────────────────────────────────────────────────
  const goalReports: GoalReport[] = allGoals.map(goal => {
    const siblings   = allGoals.filter(g => g.vectorId === goal.vectorId);
    const goalInputs = collectGoalInputs(goal, allInputs, siblings.length);

    // For abandoned goals, cap asOf at the goal's endDate so we don't penalise past closure
    const goalAsOf = goal.status === 'abandoned' && goal.endDate && goal.endDate < reportAsOf
      ? goal.endDate
      : reportAsOf;

    const { c, finalValue, scheduledPeriods, completedPeriods } =
      computeCompletion(goal, goalInputs, goalAsOf);

    const goalTau = goal.startDate && goal.endDate
      ? computeTau(goal.startDate, goal.endDate, goalAsOf)
      : t;
    const e = sharedExpectedPace(goalTau, goal.paceShape, goal.paceParam ?? null);

    return {
      goalId:           goal.id,
      vectorId:         goal.vectorId,
      description:      goal.description,
      type:             goal.type,
      status:           goal.status,
      c,
      e,
      gap:              c - e,
      startValue:       goal.startValue ?? null,
      targetValue:      goal.targetValue ?? null,
      finalValue,
      cadencePerWeek:   goal.cadencePerWeek ?? null,
      scheduledPeriods,
      completedPeriods,
    };
  });

  // ── Per-vector ────────────────────────────────────────────────────────────
  const vectorReports: VectorReport[] = allVectors
    .filter(v =>
      goalReports.some(g => g.vectorId === v.id) ||
      allInputs.some(i => i.vectorId === v.id)
    )
    .map(v => {
      const vGoals  = goalReports.filter(g => g.vectorId === v.id);
      const vInputs = allInputs.filter(i => i.vectorId === v.id);
      const avgGap  = vGoals.length > 0
        ? vGoals.reduce((s, g) => s + g.gap, 0) / vGoals.length
        : null;
      const sorted  = [...vInputs].sort((a, b) => b.date.localeCompare(a.date));
      return {
        vectorId:      v.id,
        label:         v.label,
        color:         v.color,
        avgGap,
        goalCount:     vGoals.length,
        inputCount:    vInputs.length,
        lastInputDate: sorted[0]?.date ?? null,
      };
    });

  // ── OL arc ────────────────────────────────────────────────────────────────
  const ols     = allScores.map(s => s.operatingLevel);
  const olFirst = ols.length > 0 ? ols[0]               : null;
  const olLast  = ols.length > 0 ? ols[ols.length - 1]  : null;
  const olHigh  = ols.length > 0 ? Math.max(...ols)     : null;
  const olLow   = ols.length > 0 ? Math.min(...ols)     : null;

  // ── Activity ──────────────────────────────────────────────────────────────
  const daysActive   = new Set(allInputs.map(i => i.date)).size;
  const alignments   = allScores.map(s => s.alignment).filter((a): a is number => a != null);
  const avgAlignment = alignments.length > 0
    ? alignments.reduce((s, a) => s + a, 0) / alignments.length
    : null;

  return {
    quarter,
    quarterStart: start,
    quarterEnd:   end,
    asOf:         reportAsOf,
    tau:          t,
    olFirst,
    olLast,
    olHigh,
    olLow,
    goals:        goalReports,
    vectors:      vectorReports,
    totalInputs:  allInputs.length,
    daysActive,
    avgAlignment,
  };
}

// ── DB-loading wrapper ────────────────────────────────────────────────────────

// asOf defaults to quarterEnd for a closed-quarter review.
// Pass today's date for a mid-quarter snapshot.
export function computeQuarterReport(quarter: string, asOf?: string): QuarterReport {
  const { start, end } = sharedQuarterBounds(quarter);
  const reportAsOf = asOf ?? end;

  const allVectors = db.select().from(vectors).all();
  const allGoals   = db.select().from(goals)
    .where(eq(goals.quarter, quarter))
    .all()
    .filter(g => g.status === 'active' || g.status === 'completed' || g.status === 'abandoned');
  const allInputs  = db.select().from(inputs)
    .where(and(gte(inputs.date, start), lte(inputs.date, reportAsOf)))
    .all();
  const allScores  = db.select().from(scores)
    .where(and(gte(scores.date, start), lte(scores.date, reportAsOf)))
    .all();

  return buildQuarterReport({ quarter, asOf: reportAsOf, allGoals, allInputs, allScores, allVectors });
}
