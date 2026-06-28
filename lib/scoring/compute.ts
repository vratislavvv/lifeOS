export function quarterPaceNow(): number {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const qStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
  const qEnd = new Date(now.getFullYear(), q * 3, 0);
  return Math.min(
    Math.max((now.getTime() - qStart.getTime()) / (qEnd.getTime() - qStart.getTime()), 0),
    1
  );
}

type InputRow = { vectorId: string | null; progressDelta: number | null };
type VectorRow = { id: string };

export function computeScore(
  vectors: VectorRow[],
  allInputs: InputRow[],
  pace: number
): { operatingLevel: number; vectorBreakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  for (const v of vectors) {
    const total = allInputs
      .filter(i => i.vectorId === v.id)
      .reduce((sum, i) => sum + (i.progressDelta ?? 0), 0);
    // paceGap: positive = ahead of where you should be, negative = behind
    breakdown[v.id] = Math.min(total, 1) - pace;
  }

  const gaps = Object.values(breakdown);
  const avgGap = gaps.length > 0
    ? gaps.reduce((a, b) => a + b, 0) / gaps.length
    : -pace;

  // Map avgGap (-1..+1) to operatingLevel (0..100), on-pace = 50
  const operatingLevel = Math.round(Math.min(Math.max(50 + avgGap * 50, 0), 100));

  return { operatingLevel, vectorBreakdown: breakdown };
}
