'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './today.module.css';

type Preset = { label: string; work: number; brk: number };

const DEFAULT_PRESETS: Preset[] = [
  { label: '25 / 5', work: 25 * 60, brk: 5 * 60 },
  { label: '50 / 10', work: 50 * 60, brk: 10 * 60 },
];

const R = 36;
const CIRC = 2 * Math.PI * R;
const MAX_CUSTOM = 3;
const LS_KEY        = 'lifeos-timer-presets';
const LS_STATE_KEY  = 'lifeos-timer-state';

function pad(n: number) { return String(n).padStart(2, '0'); }
type Phase = 'idle' | 'work' | 'break';

type TimerState = { phase: Phase; remaining: number; presetIdx: number; savedAt: number };

export default function FocusTimer() {
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newWork, setNewWork] = useState('');
  const [newBreak, setNewBreak] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load custom presets and restore running timer state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCustomPresets(JSON.parse(raw));
    } catch {}
    try {
      const st: TimerState = JSON.parse(localStorage.getItem(LS_STATE_KEY) ?? 'null');
      if (st && st.phase !== 'idle') {
        const elapsed = Math.floor((Date.now() - st.savedAt) / 1000);
        const adj = Math.max(st.remaining - elapsed, 0);
        setPresetIdx(st.presetIdx);
        setPhase(adj > 0 ? st.phase : 'idle');
        setRemaining(adj);
      }
    } catch {}
  }, []);

  // Persist custom presets
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(customPresets));
  }, [customPresets]);

  // Persist timer state whenever phase/remaining/presetIdx changes
  useEffect(() => {
    if (phase === 'idle') {
      localStorage.removeItem(LS_STATE_KEY);
    } else {
      const st: TimerState = { phase, remaining, presetIdx, savedAt: Date.now() };
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(st));
    }
  }, [phase, remaining, presetIdx]);

  const allPresets = [...DEFAULT_PRESETS, ...customPresets];
  const preset = allPresets[presetIdx] ?? DEFAULT_PRESETS[0];

  // Countdown tick
  useEffect(() => {
    if (phase === 'idle') return;
    intervalRef.current = setInterval(() => {
      setRemaining(r => Math.max(r - 1, 0));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase]);

  // Auto-transition on completion
  useEffect(() => {
    if (remaining > 0 || phase === 'idle') return;
    if (phase === 'work') {
      setPhase('break');
      setRemaining(preset.brk);
    } else {
      setPhase('idle');
    }
  }, [remaining, phase, preset.brk]);

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('idle');
    setRemaining(0);
  }

  function startWork() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('work');
    setRemaining(preset.work);
  }

  function skipToBreak() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('break');
    setRemaining(preset.brk);
  }

  function selectPreset(idx: number) {
    setPresetIdx(idx);
    reset();
  }

  function removeCustomPreset(customIdx: number) {
    const globalIdx = DEFAULT_PRESETS.length + customIdx;
    if (presetIdx === globalIdx) setPresetIdx(0);
    else if (presetIdx > globalIdx) setPresetIdx(i => i - 1);
    setCustomPresets(prev => prev.filter((_, i) => i !== customIdx));
    reset();
  }

  function confirmAdd() {
    const w = parseInt(newWork);
    const b = parseInt(newBreak);
    if (!w || !b || w < 1 || b < 1) return;
    const label = `${w} / ${b}`;
    setCustomPresets(prev => [...prev, { label, work: w * 60, brk: b * 60 }]);
    setNewWork('');
    setNewBreak('');
    setAdding(false);
  }

  const total = phase === 'break' ? preset.brk : preset.work;
  const progress = phase === 'idle' ? 1 : remaining / total;
  const dashOffset = CIRC * (1 - progress);

  const timeDisplay = phase === 'idle'
    ? `${pad(preset.work / 60)}:00`
    : `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;

  const ringColor = phase === 'work'
    ? 'var(--v-craft)'
    : phase === 'break'
    ? 'var(--positive)'
    : 'var(--hairline)';

  return (
    <div className={styles.timerWrap}>
      <div className={styles.islandLabel}>
        Focus
        {phase !== 'idle' && (
          <span className={`${styles.timerPhaseBadge} ${phase === 'break' ? styles.timerPhaseBadgeBreak : ''}`}>
            {phase}
          </span>
        )}
      </div>

      <div className={styles.timerRingWrap}>
        <svg className={styles.timerSvg} viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={R} fill="none" stroke="var(--hairline)" strokeWidth="3" />
          <circle
            cx="48" cy="48" r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeDasharray={CIRC}
            strokeDashoffset={phase === 'idle' ? CIRC : dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dashoffset 0.95s linear, stroke 0.3s ease' }}
          />
        </svg>
        <div className={styles.timerCenter}>
          <div className={`${styles.timerTime} ${phase !== 'idle' ? styles.timerTimeActive : ''}`}>
            {timeDisplay}
          </div>
        </div>
      </div>

      <div className={styles.timerControls}>
        {phase === 'idle' ? (
          <button className={styles.timerBtn} onClick={startWork} title="Start">
            <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
              <path d="M0 0L11 6.5L0 13V0Z" />
            </svg>
          </button>
        ) : (
          <>
            {phase === 'work' && (
              <button className={styles.timerBtnGhost} onClick={skipToBreak} title="Skip to break">
                <svg width="13" height="12" viewBox="0 0 13 12" fill="currentColor">
                  <rect x="9" y="0" width="2" height="12" rx="1" />
                  <path d="M0 0L8 6L0 12V0Z" />
                </svg>
              </button>
            )}
            <button className={styles.timerBtnGhost} onClick={reset} title="Stop">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect width="10" height="10" rx="2" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Presets row */}
      <div className={styles.timerPresets}>
        {allPresets.map((p, i) => {
          const isCustom = i >= DEFAULT_PRESETS.length;
          const customIdx = i - DEFAULT_PRESETS.length;
          return (
            <div key={p.label + i} className={styles.presetBtnWrap}>
              <button
                type="button"
                className={`${styles.presetBtn} ${i === presetIdx ? styles.presetBtnActive : ''}`}
                onClick={() => selectPreset(i)}
              >
                {p.label}
              </button>
              {isCustom && (
                <button
                  className={styles.presetRemoveBtn}
                  onClick={e => { e.stopPropagation(); removeCustomPreset(customIdx); }}
                  title="Remove preset"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {customPresets.length < MAX_CUSTOM && !adding && (
          <button
            type="button"
            className={styles.presetAddBtn}
            onClick={() => setAdding(true)}
            title="Add custom preset"
          >
            +
          </button>
        )}
      </div>

      {/* Add preset form */}
      {adding && (
        <div className={styles.addPresetRow}>
          <input
            type="number"
            className={styles.addPresetInput}
            placeholder="work"
            min={1}
            max={120}
            value={newWork}
            onChange={e => setNewWork(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmAdd()}
            autoFocus
          />
          <span className={styles.addPresetSep}>/</span>
          <input
            type="number"
            className={styles.addPresetInput}
            placeholder="brk"
            min={1}
            max={60}
            value={newBreak}
            onChange={e => setNewBreak(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmAdd()}
          />
          <button className={styles.addPresetConfirm} onClick={confirmAdd}>add</button>
          <button className={styles.addPresetCancel} onClick={() => { setAdding(false); setNewWork(''); setNewBreak(''); }}>×</button>
        </div>
      )}
    </div>
  );
}
