// Stage 7: rank contributors for the explanation sentence

export type ContributorEntry = {
  vectorId:               string;
  vectorLabel:            string;
  gap:                    number;   // Γ_v
  weight:                 number;
  dominantGoalId:         string | null;
  dominantGoalDescription: string | null;
  c:                      number;
  e:                      number;
};

type GoalResult = {
  goalId:      string;
  description: string;
  c:           number;
  e:           number;
  weight:      number;
};

type VectorResult = {
  vectorId: string;
  label:    string;
  gap:      number;
  weight:   number;
  goals:    GoalResult[];
};

export function rankContributors(vectors: VectorResult[]): ContributorEntry[] {
  return vectors
    .map(v => {
      // Dominant goal = worst gap (most behind or most ahead by magnitude × weight)
      const dominant = v.goals.reduce<GoalResult | null>((best, g) => {
        if (!best) return g;
        return Math.abs(g.c - g.e) * g.weight > Math.abs(best.c - best.e) * best.weight ? g : best;
      }, null);

      return {
        vectorId:               v.vectorId,
        vectorLabel:            v.label,
        gap:                    v.gap,
        weight:                 v.weight,
        dominantGoalId:         dominant?.goalId ?? null,
        dominantGoalDescription: dominant?.description ?? null,
        c:                      dominant?.c ?? 0,
        e:                      dominant?.e ?? 0,
      };
    })
    // Sort by |W_v · Γ_v| descending — biggest movers first
    .sort((a, b) => Math.abs(b.weight * b.gap) - Math.abs(a.weight * a.gap));
}
