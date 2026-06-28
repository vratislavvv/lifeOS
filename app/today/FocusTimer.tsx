'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './today.module.css';

const PRESETS = [
  { label: '25 / 5', work: 25 * 60, brk: 5 * 60 },
  { label: '50 / 10', work: 50 * 60, brk: 10 * 60 },
];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function FocusTimer() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function display() {
    if (remaining === 0) return '00:00';
    return `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  }

  function start() {
    setRemaining(PRESETS[presetIdx].work);
    setRunning(true);
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setRemaining(0);
  }

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { stop(); return 0; }
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  return (
    <>
      <div className={styles.islandLabel}>
        Focus · <span>{running ? 'running' : 'idle'}</span>
      </div>
      <div
        className={`${styles.focusTime} ${running ? styles.focusTimeRunning : ''}`}
        onClick={running ? stop : start}
      >
        {display()}
      </div>
      <div className={styles.focusPresets}>
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            className={`${styles.presetBtn} ${i === presetIdx ? styles.presetBtnActive : ''}`}
            onClick={() => { setPresetIdx(i); if (running) stop(); }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
