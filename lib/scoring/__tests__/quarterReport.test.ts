import { describe, it, expect } from 'vitest';
import { buildQuarterReport } from '../quarterReport';
import type { GoalRow, InputRow, ScoreRow, VectorRow } from '../quarterReport';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const Q = '2026-Q2';
const QS = '2026-04-01';  // quarter start
const QE = '2026-06-30';  // quarter end

function makeVector(id: string, label: string): VectorRow {
  return { id, label, color: '#000', order: 0, active: true, createdVia: 'preset', icon: null, description: null, weight: 1, createdAt: new Date() };
}

function makeGoal(overrides: Partial<GoalRow> & { id: string; vectorId: string; type: GoalRow['type'] }): GoalRow {
  return {
    quarter:        Q,
    description:    'test goal',
    status:         'active',
    paceShape:      'linear',
    paceParam:           null,
    startDate:           QS,
    endDate:             QE,
    weight:              1,
    targetValue:         null,
    startValue:          null,
    cadencePerWeek:      null,
    anchorId:            null,
    trackabilityTier:    null,
    dataSource:          null,
    proxyModel:          null,
    attestationCadence:  null,
    createdAt:           new Date(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<InputRow> & { id: string }): InputRow {
  return {
    date:          '2026-05-01',
    type:          'manual',
    source:        null,
    vectorId:      null,
    goalId:        null,
    rawText:       null,
    kind:          null,
    progressDelta: null,
    value:         null,
    occurredCount: null,
    durationMin:   null,
    confidence:    null,
    metadata:      null,
    createdAt:     new Date(),
    ...overrides,
  };
}

function makeScore(date: string, ol: number, alignment?: number): ScoreRow {
  return {
    id:                 date,
    date,
    operatingLevel:     ol,
    operatingLevelRaw:  ol,
    alignment:          alignment ?? null,
    contributors:       null,
    vectorBreakdown:    {},
    explanation:        null,
    createdAt:          new Date(),
  };
}

const EMPTY_DATA = {
  quarter:    Q,
  asOf:       QE,
  allGoals:   [] as GoalRow[],
  allInputs:  [] as InputRow[],
  allScores:  [] as ScoreRow[],
  allVectors: [] as VectorRow[],
};

// ── τ and quarter bounds ──────────────────────────────────────────────────────

describe('tau and quarter bounds', () => {
  it('2026-Q2 runs 2026-04-01 to 2026-06-30', () => {
    const r = buildQuarterReport({ ...EMPTY_DATA });
    expect(r.quarterStart).toBe('2026-04-01');
    expect(r.quarterEnd).toBe('2026-06-30');
  });

  it('asOf = quarterEnd → tau = 1', () => {
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: QE });
    expect(r.tau).toBeCloseTo(1, 3);
  });

  it('asOf = May 20 → tau = 49/90 ≈ 0.544', () => {
    // April 1 → June 30 is 90 days by timestamp; May 20 is 49 days in
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: '2026-05-20' });
    expect(r.tau).toBeCloseTo(49 / 90, 2);
  });
});

// ── Milestone completion ──────────────────────────────────────────────────────

describe('milestone completion', () => {
  const goal = makeGoal({ id: 'g1', vectorId: 'craft', type: 'milestone' });

  it('sums progressDelta × confidence', () => {
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.3, confidence: 1 }),
      makeInput({ id: 'i2', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.2, confidence: 0.8 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    // 0.3×1 + 0.2×0.8 = 0.46
    expect(r.goals[0].c).toBeCloseTo(0.46, 2);
  });

  it('does not cap individual deltas below their face value (MAX_INPUT_DELTA=1.0)', () => {
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.9, confidence: 1 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    expect(r.goals[0].c).toBeCloseTo(0.9, 2);
  });

  it('ignores inputs below CONFIDENCE_FLOOR (0.2)', () => {
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.5, confidence: 0.1 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    expect(r.goals[0].c).toBe(0);
  });

  it('clamps total at 1', () => {
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.34, confidence: 1 }),
      makeInput({ id: 'i2', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.34, confidence: 1 }),
      makeInput({ id: 'i3', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.34, confidence: 1 }),
      makeInput({ id: 'i4', goalId: 'g1', vectorId: 'craft', kind: 'milestone_delta', progressDelta: 0.34, confidence: 1 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    expect(r.goals[0].c).toBe(1);
  });
});

// ── Metric completion ─────────────────────────────────────────────────────────

describe('metric completion', () => {
  it('€5k→€20k, current €12k → c = 0.4667', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'money', type: 'metric', startValue: 5000, targetValue: 20000 });
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'money', kind: 'metric_value', value: 12000, date: '2026-05-20' }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('money', 'Money')] });
    expect(r.goals[0].c).toBeCloseTo(7000 / 15000, 3);
  });

  it('uses the latest reading when multiple exist', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'money', type: 'metric', startValue: 0, targetValue: 100 });
    const inputs = [
      makeInput({ id: 'i1', goalId: 'g1', vectorId: 'money', kind: 'metric_value', value: 40, date: '2026-04-15' }),
      makeInput({ id: 'i2', goalId: 'g1', vectorId: 'money', kind: 'metric_value', value: 70, date: '2026-06-01' }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('money', 'Money')] });
    expect(r.goals[0].finalValue).toBe(70);
    expect(r.goals[0].c).toBeCloseTo(0.7, 3);
  });

  it('returns c=0 with no inputs', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'money', type: 'metric', startValue: 0, targetValue: 100 });
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allVectors: [makeVector('money', 'Money')] });
    expect(r.goals[0].c).toBe(0);
  });

  it('clamps c at 1 when value exceeds target', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'money', type: 'metric', startValue: 0, targetValue: 100 });
    const inputs = [makeInput({ id: 'i1', goalId: 'g1', vectorId: 'money', kind: 'metric_value', value: 150, date: '2026-06-01' })];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('money', 'Money')] });
    expect(r.goals[0].c).toBe(1);
  });
});

// ── Consistency completion ────────────────────────────────────────────────────

describe('consistency completion', () => {
  it('24 out of 28 sessions (4/week, 7 weeks) → c ≈ 0.857', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'body', type: 'consistency', cadencePerWeek: 4, startDate: QS });
    // May 20 = exactly 49 days (7 weeks) from April 1; scheduled = 4 × 7 = 28
    const inputs = Array.from({ length: 24 }, (_, i) => makeInput({
      id: `i${i}`, goalId: 'g1', vectorId: 'body',
      kind: 'consistency_occurrence', occurredCount: 1,
      date: '2026-05-20',
    }));
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: '2026-05-20', allGoals: [goal], allInputs: inputs, allVectors: [makeVector('body', 'Body')] });
    expect(r.goals[0].completedPeriods).toBeCloseTo(24, 0);
    expect(r.goals[0].c).toBeCloseTo(24 / 28, 2);
  });

  it('returns c=0 with no occurrences', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'body', type: 'consistency', cadencePerWeek: 3, startDate: QS });
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allVectors: [makeVector('body', 'Body')] });
    expect(r.goals[0].c).toBe(0);
  });
});

// ── Expected pace (e) ─────────────────────────────────────────────────────────

describe('expected pace', () => {
  it('linear: e = τ at all points', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'v', type: 'milestone' });
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: '2026-05-20', allGoals: [goal], allVectors: [makeVector('v', 'V')] });
    expect(r.goals[0].e).toBeCloseTo(r.tau, 3);
  });

  it('on-pace anchor: G=0 → gap=0', () => {
    // milestone goal, c = e = τ (no inputs, c=0; also e=0 at start)
    const goal = makeGoal({ id: 'g1', vectorId: 'v', type: 'milestone' });
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: QS, allGoals: [goal], allVectors: [makeVector('v', 'V')] });
    expect(r.goals[0].gap).toBeCloseTo(0, 3);
  });

  it('linear: e=1 at quarter end', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'v', type: 'milestone' });
    const r = buildQuarterReport({ ...EMPTY_DATA, asOf: QE, allGoals: [goal], allVectors: [makeVector('v', 'V')] });
    expect(r.goals[0].e).toBeCloseTo(1, 3);
  });
});

// ── OL arc ────────────────────────────────────────────────────────────────────

describe('OL arc', () => {
  it('computes first, last, high, low correctly', () => {
    const scoreData = [
      makeScore('2026-04-05', 60),
      makeScore('2026-05-01', 72),
      makeScore('2026-05-20', 55),
      makeScore('2026-06-15', 68),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allScores: scoreData });
    expect(r.olFirst).toBe(60);
    expect(r.olLast).toBe(68);
    expect(r.olHigh).toBe(72);
    expect(r.olLow).toBe(55);
  });

  it('returns nulls when no scores', () => {
    const r = buildQuarterReport({ ...EMPTY_DATA });
    expect(r.olFirst).toBeNull();
    expect(r.olLast).toBeNull();
  });
});

// ── Vector-level input fallback ───────────────────────────────────────────────

describe('vector-level input fallback', () => {
  it('uses vector inputs when no goalId match', () => {
    const goal = makeGoal({ id: 'g1', vectorId: 'craft', type: 'milestone' });
    const inputs = [
      // tagged to vector only, no goalId
      makeInput({ id: 'i1', vectorId: 'craft', goalId: null, kind: 'milestone_delta', progressDelta: 0.3, confidence: 1 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [goal], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    expect(r.goals[0].c).toBeCloseTo(0.3, 2);
  });

  it('splits vector inputs evenly across sibling goals', () => {
    const g1 = makeGoal({ id: 'g1', vectorId: 'craft', type: 'milestone' });
    const g2 = makeGoal({ id: 'g2', vectorId: 'craft', type: 'milestone', description: 'second' });
    const inputs = [
      makeInput({ id: 'i1', vectorId: 'craft', goalId: null, kind: 'milestone_delta', progressDelta: 0.34, confidence: 1 }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allGoals: [g1, g2], allInputs: inputs, allVectors: [makeVector('craft', 'Craft')] });
    expect(r.goals[0].c).toBeCloseTo(0.17, 2);
    expect(r.goals[1].c).toBeCloseTo(0.17, 2);
  });
});

// ── Activity counts ───────────────────────────────────────────────────────────

describe('activity', () => {
  it('counts distinct active days', () => {
    const inputs = [
      makeInput({ id: 'i1', date: '2026-04-10' }),
      makeInput({ id: 'i2', date: '2026-04-10' }), // same day
      makeInput({ id: 'i3', date: '2026-05-01' }),
    ];
    const r = buildQuarterReport({ ...EMPTY_DATA, allInputs: inputs });
    expect(r.daysActive).toBe(2);
    expect(r.totalInputs).toBe(3);
  });

  it('avgAlignment averages score.alignment values', () => {
    const scoreData = [makeScore('2026-04-10', 65, 0.8), makeScore('2026-05-10', 70, 0.6)];
    const r = buildQuarterReport({ ...EMPTY_DATA, allScores: scoreData });
    expect(r.avgAlignment).toBeCloseTo(0.7, 3);
  });
});
