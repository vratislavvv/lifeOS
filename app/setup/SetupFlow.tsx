'use client';

import { useState, useEffect } from 'react';
import { VECTOR_KEYS } from '@/lib/vectors';
import type { SetupData } from './types';
import styles from './setup.module.css';
import Rail from './Rail';
import SetupSession from './SetupSession';
import StepYou from './steps/StepYou';
import StepVectors from './steps/StepVectors';
import StepConnect from './steps/StepConnect';
import StepLenna from './steps/StepLenna';

const INITIAL: SetupData = {
  name:          '',
  timezone:      '',
  distanceUnit:  'km',
  currency:      'EUR',
  weekStart:     'mon',
  timeFormat:    '24h',
  vectors:       [...VECTOR_KEYS],
  goals:         {},
  lennaTone:     'warm',
  lennaAutonomy: 'draft',
};

// Steps 1–4 use the Rail + step pane layout.
// Step 5 is the full-screen Lenna setup session.
export default function SetupFlow() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SetupData>(INITIAL);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setData(d => ({ ...d, timezone: tz }));
    } catch {}
  }, []);

  function onChange(patch: Partial<SetupData>) {
    setData(d => ({ ...d, ...patch }));
  }

  const goNext = () => setStep(s => Math.min(s + 1, 5));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  // Welcome screen
  if (step === 0) {
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeLogo}>
          <span className={styles.logoMark}>l</span>
          <span className={styles.logoName}>lifeOS</span>
        </div>
        <div className={styles.welcomeContent}>
          <div className={styles.welcomeEyebrow}>Welcome</div>
          <h1 className={styles.welcomeHeadline}>
            Let's build your<br />operating system.
          </h1>
          <p className={styles.welcomeSub}>
            Four quick preferences, then Lenna takes over — she'll establish
            your vectors, nail your long-term anchors, and draft this quarter's
            goals with you.
          </p>
          <div className={styles.vectorChips}>
            {VECTOR_KEYS.map(k => (
              <span
                key={k}
                className={styles.vectorChip}
                style={{ background: `var(--v-${k})` }}
              />
            ))}
            <span className={styles.vectorChipsLabel}>your six possible vectors</span>
          </div>
          <div className={styles.welcomeActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setStep(1)}
            >
              Begin setup <span>→</span>
            </button>
            <span className={styles.welcomeMeta}>~5 minutes · Lenna guides the last part</span>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen Lenna session (step 5)
  if (step === 5) {
    return <SetupSession data={data} />;
  }

  // Steps 1–4: Rail + content
  const stepProps = { data, onChange, onNext: goNext, onBack: goBack };

  return (
    <div className={styles.stepScreen}>
      <Rail currentStep={step} />
      <main className={styles.content}>
        {step === 1 && <StepYou      {...stepProps} />}
        {step === 2 && <StepVectors  {...stepProps} />}
        {step === 3 && <StepConnect  {...stepProps} />}
        {step === 4 && <StepLenna    {...stepProps} />}
      </main>
    </div>
  );
}
