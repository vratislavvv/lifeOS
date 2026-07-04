import type { VectorKey } from '@/lib/vectors';

export type SetupData = {
  name: string;
  dateOfBirth: string;
  timezone: string;
  distanceUnit: 'km' | 'mi';
  currency: string;
  weekStart: 'mon' | 'sun';
  timeFormat: '24h' | '12h';
  vectors: VectorKey[];
  lennaTone: 'warm' | 'neutral' | 'direct';
  lennaAutonomy: 'suggest' | 'draft' | 'act';
};

export type StepProps = {
  data: SetupData;
  onChange: (patch: Partial<SetupData>) => void;
  onNext: () => void;
  onBack: () => void;
};
