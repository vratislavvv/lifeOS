'use client';

import styles from './today.module.css';

const R    = 36;
const CIRC = 2 * Math.PI * R;

export default function StepsRing({
  steps,
  goal = 10000,
}: {
  steps?: number;
  goal?: number;
}) {
  const pct  = steps != null ? Math.min(steps / goal, 1) : 0;
  const fill = pct * CIRC;

  return (
    <div className={styles.stepsWrap}>
      <div className={styles.stepsRingWrap}>
        <svg viewBox="0 0 100 100" className={styles.stepsRingSvg}>
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth="7"
          />
          {pct > 0 && (
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke="var(--positive)"
              strokeWidth="7"
              strokeDasharray={`${fill} ${CIRC - fill}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          )}
        </svg>
        <div className={styles.stepsCenter}>
          <span className={styles.stepsCount}>
            {steps != null ? steps.toLocaleString() : '—'}
          </span>
          <span className={styles.stepsGoal}>
            / {(goal / 1000).toFixed(0)}k
          </span>
        </div>
      </div>
      <div className={styles.stepsLabel}>Steps</div>
    </div>
  );
}
