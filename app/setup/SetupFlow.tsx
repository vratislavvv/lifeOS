'use client';

import { useState, useEffect } from 'react';
import type { SetupData } from './types';
import styles from './setup.module.css';
import Rail from './Rail';
import SetupSession from './SetupSession';
import StepYou from './steps/StepYou';
import StepConnect from './steps/StepConnect';
import StepLenna from './steps/StepLenna';

const STORAGE_KEY = 'lifeos-setup';

const INITIAL: SetupData = {
  name:          '',
  dateOfBirth:   '',
  timezone:      '',
  distanceUnit:  'km',
  currency:      'EUR',
  weekStart:     'mon',
  timeFormat:    '24h',
  lennaTone:     'warm',
  lennaAutonomy: 'draft',
};

type Props = {
  googleConnected?: boolean;
  googleHealthConnected?: boolean;
};

// Steps 1–3 use the Rail + step pane layout.
// Step 4 is the full-screen Lenna setup session.
export default function SetupFlow({ googleConnected = false, googleHealthConnected = false }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SetupData>(INITIAL);

  // On mount: restore step + data from localStorage (survives the OAuth redirect)
  useEffect(() => {
    let savedStep = 0;
    let savedData: Partial<SetupData> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.step >= 1 && parsed.step <= 3) savedStep = parsed.step;
        if (parsed.data) savedData = parsed.data;
      }
    } catch {}

    // Auto-detect timezone only if not already saved
    let detectedTz = '';
    try { detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}

    setData(d => ({
      ...d,
      ...(detectedTz && !savedData.timezone ? { timezone: detectedTz } : {}),
      ...savedData,
    }));
    if (savedStep > 0) setStep(savedStep);
  }, []);

  // Persist step + data whenever they change (steps 1–3 only)
  useEffect(() => {
    if (step < 1 || step > 3) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data }));
    } catch {}
  }, [step, data]);

  function onChange(patch: Partial<SetupData>) {
    setData(d => ({ ...d, ...patch }));
  }

  const goNext = () => setStep(s => {
    const next = Math.min(s + 1, 4);
    if (next === 4) {
      // Lenna session is starting — data is about to be committed to DB
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
    return next;
  });
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
            Three quick preferences, then Lenna takes over — she'll help you
            discover your vectors, nail your long-term anchors, and draft this
            quarter's goals with you.
          </p>
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

  // Full-screen Lenna session (step 4)
  if (step === 4) {
    return <SetupSession data={data} />;
  }

  // Steps 1–3: Rail + content
  const stepProps = { data, onChange, onNext: goNext, onBack: goBack };

  return (
    <div className={styles.stepScreen}>
      <Rail currentStep={step} />
      <main className={styles.content}>
        {step === 1 && <StepYou     {...stepProps} />}
        {step === 2 && <StepConnect {...stepProps} googleConnected={googleConnected} googleHealthConnected={googleHealthConnected} />}
        {step === 3 && <StepLenna   {...stepProps} />}
      </main>
    </div>
  );
}
