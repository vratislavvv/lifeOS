import type { StepProps } from '../types';
import type { VectorKey } from '@/lib/vectors';
import { VECTORS, VECTOR_KEYS } from '@/lib/vectors';
import styles from '../setup.module.css';
import NavRow from '../NavRow';

export default function StepVectors({ data, onChange, onNext, onBack }: StepProps) {
  function toggle(key: VectorKey) {
    const next = data.vectors.includes(key)
      ? data.vectors.filter(k => k !== key)
      : [...data.vectors, key];
    onChange({ vectors: next });
  }

  return (
    <div className={styles.stepPane}>
      <h2 className={styles.stepHeadline}>Choose your vectors.</h2>
      <p className={styles.stepSub}>
        The dimensions lifeOS measures you on — the points of your hexagon.
        We've picked six to start; deselect any that aren't you.
      </p>

      <div className={styles.vectorsGrid}>
        {VECTOR_KEYS.map(key => {
          const v = VECTORS[key];
          const isSelected = data.vectors.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.vectorCard} ${isSelected ? styles.vectorCardSelected : ''}`}
              style={isSelected ? ({
                '--card-border': v.selectedBorder,
                '--card-bg': v.selectedBg,
              } as React.CSSProperties) : {}}
              onClick={() => toggle(key)}
            >
              <span
                className={styles.vectorCheck}
                style={{ background: v.color }}
              >
                ✓
              </span>
              <div>
                <div className={styles.vectorTitle}>{v.label}</div>
                <div className={styles.vectorSub}>{v.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.addVectorBtn}>+ Add your own</button>

      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}
