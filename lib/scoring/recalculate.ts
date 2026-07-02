// Pure orchestrator — reads DB state, runs Stages 1–7, returns a scores row.
// No LLM calls. No randomness. Same DB state → same result.

import { desc, eq, lte, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { goals, inputs, scores, vectors } from '@/lib/db/schema';
import { todayStr } from '@/lib/dates';
import { computeCompletion } from './completion';
import { goalTau, expectedPace } from './pace';
import { vectorGap } from './gap';
import { computeAlignment } from './alignment';
import { compositeGap, rawScore } from './compose';
import { emaSmooth } from './smooth';
import { rankContributors, type ContributorEntry } from './explain';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScoreResult = {
  date:              string;
  operatingLevel:    number;
  operatingLevelRaw: number;
  alignment:         number;
  contributors:      ContributorEntry[];
  vectorBreakdown:   Record<string, number>;
};

export type CalibrationResult = { calibrating: true; reason: string };

// ── recalculate ───────────────────────────────────────────────────────────────

export function recalculate(asOf?: string): ScoreResult | CalibrationResult {
  const date = asOf ?? todayStr();

  // Load active goals and active vectors
  const activeGoals = db.select().from(goals)
    .where(eq(goals.status, 'active'))
    .all();

  if (activeGoals.length === 0) {
    return { calibrating: true, reason: 'No active goals' };
  }

  const activeVectors = db.select().from(vectors)
    .where(eq(vectors.active, true))
    .all();

  // All inputs up to asOf
  const allInputs = db.select().from(inputs)
    .where(lte(inputs.date, date))
    .all();

  if (allInputs.length === 0) {
    return { calibrating: true, reason: 'No inputs yet' };
  }

  // Previous OL for EMA (most recent score before today)
  const prevScore = db.select().from(scores)
    .where(lt(scores.date, date))
    .orderBy(desc(scores.date))
    .limit(1)
    .get();
  const prevOL = prevScore?.operatingLevel ?? null;

  // ── Stage 1 + 2: completion and expected pace per goal ────────────────────

  const goalResults = activeGoals.map(goal => {
    // Inputs for this goal: exact goalId match first, then vector-level untagged
    const goalInputs = allInputs.filter(i =>
      i.goalId === goal.id ||
      (i.goalId === null && i.vectorId === goal.vectorId)
    );

    const c   = computeCompletion(
      {
        type:           goal.type as 'milestone' | 'metric' | 'consistency',
        startDate:      goal.startDate,
        cadencePerWeek: goal.cadencePerWeek,
        startValue:     goal.startValue,
        targetValue:    goal.targetValue,
      },
      goalInputs.map(i => ({
        kind:          i.kind,
        progressDelta: i.progressDelta,
        value:         i.value,
        occurredCount: i.occurredCount,
        confidence:    i.confidence,
        date:          i.date,
      })),
      date,
    );

    const tau = goalTau(goal.startDate, goal.endDate, date);
    const e   = expectedPace(tau, goal.paceShape, goal.paceParam);

    return {
      goalId:      goal.id,
      vectorId:    goal.vectorId,
      description: goal.description,
      type:        goal.type,
      c,
      e,
      tau,
      weight:      goal.weight ?? 1,
    };
  });

  // ── Stage 3: vector gap + staleness ──────────────────────────────────────

  type VectorEntry = {
    vectorId: string;
    label:    string;
    gap:      number;
    weight:   number;
    goals:    typeof goalResults;
  };

  const vectorEntries: VectorEntry[] = [];

  for (const v of activeVectors) {
    const vGoals = goalResults.filter(g => g.vectorId === v.id);
    if (vGoals.length === 0) continue; // no active goal → exclude from composite

    const vInputs = allInputs.filter(i => i.vectorId === v.id);
    const lastInputDate = vInputs.length > 0
      ? vInputs.reduce((max, i) => i.date > max ? i.date : max, vInputs[0].date)
      : null;

    const gap = vectorGap(vGoals, lastInputDate, date);

    vectorEntries.push({ vectorId: v.id, label: v.label, gap, weight: 1, goals: vGoals });
  }

  if (vectorEntries.length === 0) {
    return { calibrating: true, reason: 'No vectors with active goals' };
  }

  // ── Stage 4: alignment ────────────────────────────────────────────────────

  const { a, p } = computeAlignment(
    allInputs.map(i => ({
      date:        i.date,
      vectorId:    i.vectorId,
      goalId:      i.goalId,
      durationMin: i.durationMin,
    })),
    date,
  );

  // ── Stage 5: composite G → raw score S ───────────────────────────────────

  const G = compositeGap(vectorEntries, p);
  const S = rawScore(G);

  // ── Stage 6: EMA ─────────────────────────────────────────────────────────

  const OL = emaSmooth(S, prevOL);

  // ── Stage 7: contributors ─────────────────────────────────────────────────

  const contributors = rankContributors(vectorEntries);

  // Vector breakdown for backward compatibility (quarter view gap bars)
  const vectorBreakdown: Record<string, number> = {};
  vectorEntries.forEach(v => { vectorBreakdown[v.vectorId] = v.gap; });

  return {
    date,
    operatingLevel:    Math.round(OL * 10) / 10,
    operatingLevelRaw: Math.round(S  * 10) / 10,
    alignment:         a,
    contributors,
    vectorBreakdown,
  };
}
