import styles from './setup.module.css';

const STEPS = [
  { num: '01', name: 'You' },
  { num: '02', name: 'Connect' },
  { num: '03', name: 'Lenna' },
];

export default function Rail({ currentStep }: { currentStep: number }) {
  return (
    <nav className={styles.rail}>
      <div className={styles.railLogo}>
        <span className={styles.logoMark}>l</span>
        <span className={styles.logoName}>lifeOS</span>
      </div>
      <div className={styles.railEyebrow}>Setting up</div>
      <div className={styles.stepList}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const isDone   = n < currentStep;
          const isActive = n === currentStep;
          return (
            <div
              key={n}
              className={`${styles.stepItem} ${isActive ? styles.stepItemActive : ''}`}
            >
              <span
                className={[
                  styles.stepDot,
                  isDone   ? styles.stepDotDone   : '',
                  isActive ? styles.stepDotActive : '',
                ].join(' ')}
              />
              <span className={styles.stepLabel}>
                <span className={styles.stepNum}>{s.num}</span>
                <span className={styles.stepName}>{s.name}</span>
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
