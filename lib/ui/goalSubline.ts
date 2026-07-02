type GoalForSubline = {
  type:           string;
  startValue:     number | null;
  targetValue:    number | null;
  cadencePerWeek: number | null;
  paceShape:      string;
};

export function goalSubline(g: GoalForSubline): string {
  if (g.type === 'metric' && g.startValue != null && g.targetValue != null) {
    return `${g.startValue} → ${g.targetValue}`;
  }
  if (g.type === 'consistency' && g.cadencePerWeek != null) {
    return `${g.cadencePerWeek}×/week`;
  }
  return g.paceShape;
}
