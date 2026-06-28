'use client';

import { useState } from 'react';
import type { StepProps } from '../types';
import styles from '../setup.module.css';
import NavRow from '../NavRow';

const CONNECTIONS = [
  { id: 'strava',    label: 'Strava',           icon: 'S', tag: 'Body',     tagColor: '#7E8A6B' },
  { id: 'notion',    label: 'Notion',            icon: 'N', tag: 'Craft',    tagColor: '#B0853F' },
  { id: 'gcal',      label: 'Google Calendar',   icon: 'C', tag: 'Schedule', tagColor: '#9A968B' },
  { id: 'monarch',   label: 'Monarch',           icon: 'M', tag: 'Money',    tagColor: '#6B7E8A' },
];

export default function StepConnect({ onNext, onBack }: StepProps) {
  const [connected, setConnected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setConnected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.stepPane}>
      <h2 className={styles.stepHeadline}>Connect your data.</h2>
      <p className={styles.stepSub}>
        lifeOS reads your sources so you don't have to report in.
        Connect what you have — skip the rest and add later.
      </p>

      <div className={styles.connectionsList}>
        {CONNECTIONS.map(c => (
          <div key={c.id} className={styles.connectionRow}>
            <div className={styles.connectionIcon}>{c.icon}</div>
            <div className={styles.connectionInfo}>
              <div className={styles.connectionName}>{c.label}</div>
              <div className={styles.connectionMeta}>
                <span className={styles.connectionTagDot} style={{ background: c.tagColor }} />
                <span className={styles.connectionTagLabel}>{c.tag}</span>
              </div>
            </div>
            {connected.has(c.id) ? (
              <div className={styles.badgeConnected}>
                <span className={styles.badgeDot} />
                Connected
              </div>
            ) : (
              <button
                type="button"
                className={styles.btnConnect}
                onClick={() => toggle(c.id)}
              >
                Connect
              </button>
            )}
          </div>
        ))}
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={onNext}
        skipLabel="Skip for now"
      />
    </div>
  );
}
