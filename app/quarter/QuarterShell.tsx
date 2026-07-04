'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './quarter.module.css';
import type { vectors, goals, scores, user } from '@/lib/db/schema';

export type PastQuarterEntry = {
  quarter:  string;
  olLast:   number | null;
  olDelta:  number | null;
  summary:  string | null;
};

type User     = typeof user.$inferSelect;
type Vector   = typeof vectors.$inferSelect;
type GoalCard = typeof goals.$inferSelect & { c: number; e: number; gap: number };

type Props = {
  user:             User;
  vectors:          Vector[];
  goalCards:        GoalCard[];
  latestScore:      typeof scores.$inferSelect | null;
  quarter:          string;
  currentQuarter:   string;
  prevQuarter:      string;
  nextQuarter:      string | null;
  tau:              number;
  quarterStart:     string;
  quarterEnd:       string;
  quarterIsoStart:  string;
  daysLeft:         number;
  hasData:          boolean;
  reviewPending?:   boolean;
  closedQuarter?:   string;
  pastQuarters:     PastQuarterEntry[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function quarterLabel(q: string) {
  const [year, num] = q.split('-Q');
  return `Q${num} · ${year}`;
}

function axisLabels(quarter: string, startLabel: string, endLabel: string) {
  const [year, num] = quarter.split('-Q');
  const mid = new Date(parseInt(year), (parseInt(num) - 1) * 3 + 1, 1)
    .toLocaleDateString('en-US', { month: 'short' });
  return [startLabel, mid, endLabel];
}

type VectorRow = Vector & {
  vGoals:   GoalCard[];
  hasGoals: boolean;
  avgC:     number;
  avgE:     number;
  gap:      number;
};

function buildVectorRows(vectors: Vector[], goalCards: GoalCard[]): VectorRow[] {
  return vectors.map(v => {
    const vGoals  = goalCards.filter(g => g.vectorId === v.id);
    const hasGoals = vGoals.length > 0;
    const avgC  = hasGoals ? vGoals.reduce((s, g) => s + g.c, 0) / vGoals.length : 0;
    const avgE  = hasGoals ? vGoals.reduce((s, g) => s + g.e, 0) / vGoals.length : 0;
    const gap   = hasGoals ? avgC - avgE : 0;
    return { ...v, vGoals, hasGoals, avgC, avgE, gap };
  });
}

function rowStatus(row: VectorRow): { text: string; cls: string } {
  if (!row.hasGoals) return { text: '—', cls: styles.statusEmpty };
  if (row.gap >=  0.02) return { text: 'Ahead',    cls: styles.statusPositive };
  if (row.gap >= -0.05) return { text: 'On pace',  cls: styles.statusPositive };
  return { text: `−${Math.round(Math.abs(row.gap) * 100)}pp`, cls: styles.statusBehind };
}

// ── Past-quarters popover ─────────────────────────────────────────────────────

function PastQuartersPicker({
  onClose, currentQuarter, onSelect, pastQuarters,
}: {
  onClose:      () => void;
  currentQuarter: string;
  onSelect:     (q: string) => void;
  pastQuarters: PastQuarterEntry[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  const count = pastQuarters.length;

  return (
    <div className={styles.pastPicker} ref={ref}>
      <div className={styles.pastPickerHeader}>
        <span>Past quarters</span>
        <span className={styles.pastPickerCount}>
          {count === 0 ? 'none yet' : `${count} recorded`}
        </span>
      </div>

      {count === 0 ? (
        <div className={styles.pastPickerEmpty}>
          <div className={styles.pastPickerDash}>—</div>
          <div className={styles.pastPickerEmptyTitle}>No quarters recorded yet</div>
          <div className={styles.pastPickerEmptyHint}>
            Your first review lands the day {currentQuarter.replace('-Q', ' Q')} closes. Until then
            there&apos;s nothing to look back on — but Lenna can help you set the targets she&apos;ll measure against.
          </div>
        </div>
      ) : (
        <div className={styles.pastPickerList}>
          {pastQuarters.map((pq, i) => {
            const [yr, qn] = pq.quarter.split('-Q');
            const deltaPositive = (pq.olDelta ?? 0) >= 0;
            const deltaText = pq.olDelta == null
              ? 'baseline'
              : `${deltaPositive ? '▲' : '▼'} ${Math.abs(pq.olDelta)}`;
            const deltaColor = pq.olDelta == null
              ? 'var(--ink-faint)'
              : deltaPositive ? 'var(--positive)' : 'var(--attention)';
            return (
              <div
                key={pq.quarter}
                className={`${styles.pastPickerRow} ${i === 0 ? styles.pastPickerRowHighlight : ''}`}
              >
                <div className={styles.pastPickerRowQ}>
                  <div className={styles.pastPickerRowLabel}>Q{qn}</div>
                  <div className={styles.pastPickerRowYear}>{yr}</div>
                </div>
                <div className={styles.pastPickerRowCenter}>
                  <div className={styles.pastPickerRowScoreLine}>
                    <span className={styles.pastPickerScore}>
                      {pq.olLast != null ? Math.round(pq.olLast) : '—'}
                    </span>
                    <span className={styles.pastPickerDelta} style={{ color: deltaColor }}>
                      {deltaText}
                    </span>
                  </div>
                  {pq.summary && (
                    <div className={styles.pastPickerSummary}>{pq.summary}</div>
                  )}
                </div>
                <button
                  className={`${styles.pastPickerReviewBtn} ${i === 0 ? styles.pastPickerReviewBtnPrimary : ''}`}
                  onClick={() => { onSelect(pq.quarter); }}
                >
                  Review
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Vector pace row ───────────────────────────────────────────────────────────

function VectorPaceRow({ row, isLast }: { row: VectorRow; isLast: boolean }) {
  const cPct     = Math.round(row.avgC * 100);
  const ePct     = Math.round(row.avgE * 100);
  const tickBehind = row.gap < -0.05;
  const status   = rowStatus(row);

  return (
    <div className={`${styles.vRow} ${isLast ? styles.vRowLast : ''}`}>
      <div className={styles.vRowName}>
        <span className={styles.vRowSwatch} style={{ background: row.color }} />
        <span className={styles.vRowLabel}>{row.label}</span>
      </div>

      <div className={styles.vRowValues}>
        {row.hasGoals ? (
          <span className={styles.vRowValText}>{cPct}%</span>
        ) : (
          <span className={styles.vRowValEmpty}>—</span>
        )}
      </div>

      <div className={styles.vRowBar}>
        {row.hasGoals && (
          <div
            className={styles.vRowFill}
            style={{ width: `${Math.min(cPct, 100)}%`, background: row.color }}
          />
        )}
        {row.hasGoals && (
          <div
            className={styles.vRowTick}
            style={{
              left: `${Math.min(ePct, 100)}%`,
              background: tickBehind ? 'var(--attention)' : 'var(--ink-soft)',
            }}
          />
        )}
      </div>

      <div className={`${styles.vRowStatus} ${status.cls}`}>{status.text}</div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function QuarterShell({
  user, vectors, goalCards, latestScore,
  quarter, currentQuarter, prevQuarter, nextQuarter,
  tau, quarterStart, quarterEnd, quarterIsoStart,
  daysLeft, hasData, reviewPending, closedQuarter, pastQuarters,
}: Props) {
  const router = useRouter();

  const [notifDismissed, setNotifDismissed] = useState(false);
  const [pastOpen,       setPastOpen]       = useState(false);

  const isCurrentQ  = quarter === currentQuarter;
  const label       = quarterLabel(quarter);
  const olValue     = latestScore ? Math.round(latestScore.operatingLevel) : null;
  const [axis0, axisMid, axis1] = axisLabels(quarter, quarterStart, quarterEnd);
  const tauPct      = Math.round(tau * 100);
  const vRows       = buildVectorRows(vectors, goalCards);

  function navigateTo(q: string) {
    if (q === currentQuarter) router.push('/quarter');
    else router.push(`/quarter?q=${q}`);
  }

  const showNotif = isCurrentQ && reviewPending && !!closedQuarter && !notifDismissed;

  return (
    <div className={styles.app}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}>
              <Link href="/today" className={styles.navLink}>Today</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/quarter" className={`${styles.navLink} ${styles.navLinkActive}`}>Quarter</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/tasks" className={styles.navLink}>Tasks</Link>
            </div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <Link href="/settings" className={styles.sidebarFooterLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>

        {/* Rollover notification strip */}
        {showNotif && closedQuarter && (() => {
          const [cqYear, cqNum] = closedQuarter.split('-Q');
          return (
            <div className={styles.notif}>
              <div className={styles.notifLeft}>
                <div className={styles.notifAvatar}>L</div>
                <div>
                  <span className={styles.notifTextMain}>Q{cqNum} is complete — I pulled your review together. </span>
                  <span className={styles.notifTextSoft}>Trends, wins, and what I&apos;d carry forward.</span>
                </div>
              </div>
              <div className={styles.notifRight}>
                <Link href="/quarter/review" className={styles.notifBtn}>
                  Review Q{cqNum} →
                </Link>
                <button className={styles.notifDismiss} onClick={() => setNotifDismissed(true)}>✕</button>
              </div>
            </div>
          );
        })()}

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle}>{label}</div>
            <div className={styles.headerSub}>
              {olValue != null ? `operating level ${olValue} · ` : ''}{quarterStart}–{quarterEnd}
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.headerNavBtn}
              onClick={() => navigateTo(prevQuarter)}
              title={prevQuarter}
            >‹</button>
            {nextQuarter && (
              <button
                className={styles.headerNavBtn}
                onClick={() => navigateTo(nextQuarter)}
                title={nextQuarter}
              >›</button>
            )}
            <div className={styles.headerDivider} />
            <div style={{ position: 'relative' }}>
              <button
                className={styles.headerPastBtn}
                onClick={() => setPastOpen(o => !o)}
              >
                Past quarters <span style={{ fontSize: '8px' }}>▾</span>
              </button>
              {pastOpen && (
                <PastQuartersPicker
                  onClose={() => setPastOpen(false)}
                  currentQuarter={currentQuarter}
                  onSelect={q => { navigateTo(q); setPastOpen(false); }}
                  pastQuarters={pastQuarters}
                />
              )}
            </div>
            {isCurrentQ && (
              <Link href="/quarter/replan" className={styles.headerRevBtn}>
                Revision →
              </Link>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Historical empty state */}
          {!isCurrentQ && !hasData ? (
            <div className={styles.emptyHistory}>
              <div className={styles.emptyHistoryTitle}>Nothing recorded for {label}</div>
              <div className={styles.emptyHistoryHint}>No goals or data were logged this quarter.</div>
            </div>
          ) : (
            <>
              {/* Quarter progress */}
              <div className={styles.progressSection}>
                <div className={styles.progressLabelRow}>
                  <span className={styles.progressLabel}>Quarter progress</span>
                  <span className={styles.progressRight}>
                    <span className={styles.progressPct}>{tauPct}%</span>
                    {isCurrentQ && (
                      <span className={styles.progressDays}>· {daysLeft} days left</span>
                    )}
                  </span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${tauPct}%` }} />
                  <div className={styles.progressKnob} style={{ left: `${tauPct}%` }} />
                </div>
                <div className={styles.progressAxis}>
                  <span>{axis0}</span>
                  <span>{axisMid}</span>
                  <span>{axis1}</span>
                </div>
              </div>

              {/* Vectors */}
              <div className={styles.vectorsSection}>
                <div className={styles.vectorsSectionHead}>
                  <span className={styles.vectorsSectionTitle}>Vectors</span>
                  <span className={styles.vectorsSectionHint}>now / expected · pace tick = where you should be today</span>
                </div>
                <div className={styles.vectorRows}>
                  {vRows.map((row, i) => (
                    <VectorPaceRow key={row.id} row={row} isLast={i === vRows.length - 1} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
