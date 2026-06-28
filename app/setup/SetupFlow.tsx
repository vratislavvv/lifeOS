'use client';

import { useState, useEffect } from 'react';
import { VECTOR_KEYS } from '@/lib/vectors';
import type { SetupData } from './types';
import styles from './setup.module.css';
import Rail from './Rail';
import StepYou from './steps/StepYou';
import StepVectors from './steps/StepVectors';
import StepQuarter from './steps/StepQuarter';
import StepConnect from './steps/StepConnect';
import StepLenna from './steps/StepLenna';
import StepReady from './steps/StepReady';

const INITIAL: SetupData = {
  name: '',
  timezone: '',
  distanceUnit: 'km',
  currency: 'EUR',
  weekStart: 'mon',
  timeFormat: '24h',
  vectors: [...VECTOR_KEYS],
  goals: {},
  lennaTone: 'warm',
  lennaAutonomy: 'draft',
};

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

  const goNext = () => setStep(s => Math.min(s + 1, 6));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

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
            Six quick questions. lifeOS uses them to set your vectors, lay out
            your first quarter, and teach Lenna how to run your days.
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
            <span className={styles.welcomeMeta}>6 steps · about 2 minutes</span>
          </div>
        </div>
      </div>
    );
  }

  const stepProps = { data, onChange, onNext: goNext, onBack: goBack };

  return (
    <div className={styles.stepScreen}>
      <Rail currentStep={step} />
      <main className={styles.content}>
        {step === 1 && <StepYou {...stepProps} />}
        {step === 2 && <StepVectors {...stepProps} />}
        {step === 3 && <StepQuarter {...stepProps} />}
        {step === 4 && <StepConnect {...stepProps} />}
        {step === 5 && <StepLenna {...stepProps} />}
        {step === 6 && <StepReady {...stepProps} />}
      </main>
    </div>
  );
}
