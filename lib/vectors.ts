export const VECTORS = {
  craft: {
    label: 'Craft',
    color: '#B0853F',
    sub: 'work, skills, shipping',
    goalHint: 'Ship the operating-level engine',
    selectedBorder: 'rgba(176,133,63,0.45)',
    selectedBg: 'rgba(176,133,63,0.06)',
  },
  body: {
    label: 'Body',
    color: '#7E8A6B',
    sub: 'training, health',
    goalHint: 'Run a sub-1:45 half',
    selectedBorder: 'rgba(126,138,107,0.45)',
    selectedBg: 'rgba(126,138,107,0.06)',
  },
  money: {
    label: 'Money',
    color: '#6B7E8A',
    sub: 'savings, net worth',
    goalHint: 'Lift savings to 30%',
    selectedBorder: 'rgba(107,126,138,0.45)',
    selectedBg: 'rgba(107,126,138,0.06)',
  },
  mind: {
    label: 'Mind',
    color: '#7E6B8A',
    sub: 'reading, learning',
    goalHint: 'Read 12 books',
    selectedBorder: 'rgba(126,107,138,0.45)',
    selectedBg: 'rgba(126,107,138,0.06)',
  },
  social: {
    label: 'Social',
    color: '#8A6B7E',
    sub: 'friends, family',
    goalHint: 'Weekly dinners with family',
    selectedBorder: 'rgba(138,107,126,0.45)',
    selectedBg: 'rgba(138,107,126,0.06)',
  },
  rest: {
    label: 'Rest',
    color: '#6B8A8A',
    sub: 'sleep, recovery',
    goalHint: 'In bed by 23:00',
    selectedBorder: 'rgba(107,138,138,0.45)',
    selectedBg: 'rgba(107,138,138,0.06)',
  },
} as const;

export type VectorKey = keyof typeof VECTORS;
export const VECTOR_KEYS: VectorKey[] = ['craft', 'body', 'money', 'mind', 'social', 'rest'];
