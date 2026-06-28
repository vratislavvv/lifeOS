'use client';

import { useState, useTransition } from 'react';
import styles from './today.module.css';
import Clock from './Clock';
import FocusTimer from './FocusTimer';
import CalSection from './CalSection';
import { submitInput } from './actions';
import type { vectors, goals, scores, user } from '@/lib/db/schema';

type User = typeof user.$inferSelect;
type Vector = typeof vectors.$inferSelect;
type Goal = typeof goals.$inferSelect;
type Score = typeof scores.$inferSelect;

type Props = {
  user: User;
  vectors: Vector[];
  goals: Goal[];
  score: Score | null;
  currentQuarter: string;
  quarterPace: number;
};

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(d: Date) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function TodayShell({ user, vectors, goals, score, currentQuarter, quarterPace }: Props) {
  const today = new Date();
  const [inputText, setInputText] = useState('');
  const [pending, startTransition] = useTransition();

  const [qYear, qNum] = currentQuarter.split('-Q');
  const quarterLabel = `Q${qNum} ${qYear}`;

  const breakdown = score
    ? (score.vectorBreakdown as Record<string, number>)
    : {};

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending) return;
    startTransition(async () => {
      await submitInput(text);
      setInputText('');
    });
  }

  return (
    <div className={styles.app}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}>
              <div className={`${styles.navLink} ${styles.navLinkActive}`}>Today</div>
            </div>
            <div className={styles.navItem}>
              <div className={styles.navLink}>Quarter</div>
            </div>
            <div className={styles.navItem}>
              <div className={styles.navLink}>Focus</div>
            </div>
            <div className={styles.navItem}>
              <div className={styles.navLink}>
                <span className={styles.navToggle}>▼</span>Stats
              </div>
            </div>
            <div className={styles.navChildren}>
              {vectors.map(v => (
                <div key={v.id} className={styles.navChild}>
                  <div className={styles.navLink}>
                    <span className={styles.vecDot} style={{ background: v.color }} />
                    {v.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarFooterLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.content}>

        {/* Header */}
        <div className={styles.contentHeader}>
          <div>
            <div className={styles.headerTitle}>{user.name}</div>
            <div className={styles.headerDate}>{formatDate(today)}</div>
          </div>
          <div className={styles.headerScore}>
            <div className={`${styles.scoreNum} ${score ? styles.scoreNumSet : ''}`}>
              {score ? Math.round(score.operatingLevel) : '—'}
            </div>
            <div className={styles.scoreLabel}>operating level</div>
          </div>
        </div>

        {/* Row 1: Today island + Clock */}
        <div className={styles.row}>
          <div className={`${styles.island} ${styles.todayIsland}`}>
            <div className={styles.islandLabel}>Today</div>
            <div className={styles.emptyState}>
              No tasks yet — Lenna will suggest after your first input.
            </div>
          </div>
          <div className={`${styles.island} ${styles.islandSunk} ${styles.clockIsland}`}>
            <Clock timeFormat={user.timeFormat} timezone={user.timezone} />
          </div>
        </div>

        {/* Row 2: Quarter island + Focus */}
        <div className={styles.row}>
          <div className={`${styles.island} ${styles.quarterIsland}`}>
            <div className={styles.islandLabel}>Quarter · {quarterLabel}</div>
            {vectors.map(v => {
              const paceGap = breakdown[v.id] ?? null;
              const progress = paceGap !== null
                ? Math.min(Math.max(paceGap + quarterPace, 0), 1)
                : null;
              const ahead = paceGap !== null && paceGap >= 0;
              const deltaLabel = paceGap !== null
                ? `${ahead ? '+' : ''}${Math.round(paceGap * 100)}pp`
                : '—';
              return (
                <div key={v.id} className={styles.vectorRow}>
                  <div className={styles.vdot} style={{ background: v.color }} />
                  <span className={styles.vlabel}>{v.label}</span>
                  <div className={styles.vtrack}>
                    <div className={styles.vtrackBg} />
                    <div className={styles.vpace} style={{ left: `${quarterPace * 100}%` }} />
                    {progress !== null && (
                      <div
                        className={styles.vnow}
                        style={{ left: `${progress * 100}%`, background: v.color }}
                      />
                    )}
                  </div>
                  <span
                    className={styles.vdelta}
                    style={{ color: paceGap !== null ? (ahead ? 'var(--positive)' : 'var(--attention)') : undefined }}
                  >
                    {deltaLabel}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={`${styles.island} ${styles.islandSunk} ${styles.focusIsland}`}>
            <FocusTimer />
          </div>
        </div>

        {/* Calendar */}
        <CalSection weekStart={user.weekStart} />

      </main>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle}>
        <div className={styles.handleDots}>
          <div className={styles.handleDot} />
          <div className={styles.handleDot} />
          <div className={styles.handleDot} />
        </div>
      </div>

      {/* ── Assistant / Lenna ── */}
      <aside className={styles.assistant}>
        <div className={styles.assistantHeader}>
          <span className={styles.assistantTitle}>Lenna</span>
          <span className={styles.assistantCollapse}>←</span>
        </div>
        <div className={styles.assistantBody}>
          {!score ? (
            <div className={styles.proposalCard}>
              <div className={styles.proposalType}>welcome</div>
              <div className={styles.proposalText}>
                Setup complete. Tell me what moved today and I'll compute your first operating level score.
              </div>
            </div>
          ) : (
            <div className={styles.proposalCard}>
              <div className={styles.proposalType}>score</div>
              <div className={styles.proposalText}>
                Operating level <strong>{Math.round(score.operatingLevel)}</strong>.{' '}
                {score.explanation}
              </div>
            </div>
          )}
          {pending && (
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
              Processing…
            </div>
          )}
        </div>
        <div className={styles.assistantInputWrap}>
          <textarea
            className={styles.assistantInput}
            placeholder="What moved today?"
            rows={2}
            value={inputText}
            disabled={pending}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {inputText.trim() && !pending && (
            <div className={styles.assistantInputHint}>⌘↵ to send</div>
          )}
        </div>
      </aside>

    </div>
  );
}
