'use client';

import { useState } from 'react';
import type { StepProps } from '../types';
import { completeSetup } from '../actions';
import styles from '../setup.module.css';

export default function StepReady({ data, onBack }: StepProps) {
  const [submitting, setSubmitting] = useState(false);
  const first = data.name.trim().split(' ')[0] || 'you';
  const filledGoals = Object.values(data.goals).filter(g => g?.trim()).length;

  const chips = [
    `${data.vectors.length} vector${data.vectors.length !== 1 ? 's' : ''}`,
    filledGoals > 0
      ? `${filledGoals} goal${filledGoals !== 1 ? 's' : ''} queued`
      : 'goals from Lenna',
  ];

  async function handleEnter() {
    setSubmitting(true);
    await completeSetup(data);
  }

  return (
    <div className={styles.readyPane}>
      <h2 className={styles.readyHeadline}>You're set, {first}.</h2>
      <p className={styles.readySub}>
        Here's your starting shape. lifeOS fills it in as you live — and Lenna
        takes it from here.
      </p>

      <div className={styles.hexWrap}>
        <svg width="200" viewBox="0 0 200 185" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon
            points="100,25 160.6,60 160.6,130 100,165 39.4,130 39.4,60"
            stroke="rgba(41,39,35,0.12)"
            strokeWidth="1"
            fill="none"
          />
          <line x1="100" y1="95" x2="100"   y2="25"  stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <line x1="100" y1="95" x2="160.6" y2="60"  stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <line x1="100" y1="95" x2="160.6" y2="130" stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <line x1="100" y1="95" x2="100"   y2="165" stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <line x1="100" y1="95" x2="39.4"  y2="130" stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <line x1="100" y1="95" x2="39.4"  y2="60"  stroke="rgba(41,39,35,0.08)" strokeWidth="1" />
          <polygon
            points="100,55.8 147.3,67.7 137.6,116.7 100,144 70.9,111.8 75.7,81"
            fill="rgba(41,39,35,0.05)"
            stroke="rgba(41,39,35,0.30)"
            strokeWidth="1.5"
          />
          <circle cx="100"   cy="55.8"  r="4" fill="#B0853F" />
          <circle cx="147.3" cy="67.7"  r="4" fill="#7E8A6B" />
          <circle cx="137.6" cy="116.7" r="4" fill="#6B7E8A" />
          <circle cx="100"   cy="144"   r="4" fill="#7E6B8A" />
          <circle cx="70.9"  cy="111.8" r="4" fill="#8A6B7E" />
          <circle cx="75.7"  cy="81"    r="4" fill="#6B8A8A" />
        </svg>
      </div>

      <div className={styles.readyChips}>
        {chips.map(c => (
          <span key={c} className={styles.readyChip}>{c}</span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          className={`${styles.btnPrimary} ${submitting ? styles.btnPrimaryDisabled : ''}`}
          onClick={handleEnter}
          disabled={submitting}
        >
          {submitting ? 'Setting up…' : 'Enter lifeOS →'}
        </button>
        {!submitting && (
          <button type="button" className={styles.btnBack} onClick={onBack}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
