import type { StepProps } from '../types';
import type { VectorKey } from '@/lib/vectors';
import { VECTORS } from '@/lib/vectors';
import styles from '../setup.module.css';
import NavRow from '../NavRow';

export default function StepQuarter({ data, onChange, onNext, onBack }: StepProps) {
  function setGoal(key: VectorKey, value: string) {
    onChange({ goals: { ...data.goals, [key]: value } });
  }

  return (
    <div className={styles.stepPane}>
      <h2 className={styles.stepHeadline}>
        What do you want to<br />move this quarter?
      </h2>
      <p className={styles.stepSub}>
        A line each is plenty. Lenna turns these into targets on your whiteboard
        — leave any blank and she'll suggest one.
      </p>

      <div className={styles.goalsList}>
        {data.vectors.map(key => {
          const v = VECTORS[key];
          return (
            <div key={key} className={styles.goalRow}>
              <span className={styles.goalDot} style={{ background: v.color }} />
              <input
                className={styles.goalInput}
                type="text"
                placeholder={v.goalHint}
                value={data.goals[key] ?? ''}
                onChange={e => setGoal(key, e.target.value)}
                autoComplete="off"
              />
            </div>
          );
        })}
      </div>

      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}
