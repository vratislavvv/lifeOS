'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { goalSubline } from '@/lib/ui/goalSubline';
import LennaPanel from '@/components/LennaPanel';
import { reviewSessionTurn, commitReviewSession } from './reviewActions';
import type { QuarterReport } from '@/lib/scoring/quarterReport';
import type { ChatMessage } from '@/lib/llm/reviewChat';
import type { vectors, goals, user } from '@/lib/db/schema';
import sty from '../setup/session.module.css';
import styles from './review.module.css';

type User      = typeof user.$inferSelect;
type Vector    = typeof vectors.$inferSelect;

type DraftGoal = {
  id:             string;
  vectorId:       string;
  description:    string;
  type:           string;
  startValue:     number | null;
  targetValue:    number | null;
  cadencePerWeek: number | null;
  paceShape:      string;
};

type Props = {
  user:               User;
  vectors:            Vector[];
  sessionId:          string;
  closedQuarter:      string;
  nextQuarter:        string;
  phase:              string;
  report:             QuarterReport;
  scoreHistory:       { date: string; ol: number }[];
  olDelta:            number | null;
  closedStart:        string;
  closedEnd:          string;
  existingDraftGoals: DraftGoal[];
};

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history }: { history: { date: string; ol: number }[] }) {
  if (history.length < 2) return null;
  const W = 150, H = 46;
  const ols = history.map(h => h.ol);
  const minOl = Math.min(...ols), maxOl = Math.max(...ols);
  const range = maxOl - minOl || 1;
  const pts = history.map((h, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - 3 - ((h.ol - minOl) / range) * (H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = H - 3 - ((ols[ols.length - 1] - minOl) / range) * (H - 6);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" />
      <circle cx={W} cy={lastY} r="3" fill="var(--ink)" />
    </svg>
  );
}

// ── Scorecard (center, report/discuss phase) ──────────────────────────────────

function ScoreCard({
  report, vectors, olDelta, scoreHistory,
}: {
  report:       QuarterReport;
  vectors:      Vector[];
  olDelta:      number | null;
  scoreHistory: { date: string; ol: number }[];
}) {
  const olLast = report.olLast != null ? Math.round(report.olLast) : null;
  const deltaPositive = (olDelta ?? 0) >= 0;

  return (
    <div className={styles.scorecard}>
      {/* OL close */}
      <div className={styles.olSection}>
        <div>
          <div className={styles.olCaption}>operating level · close</div>
          <div className={styles.olRow}>
            <span className={styles.olHero}>{olLast ?? '—'}</span>
            {olDelta != null && (
              <span className={styles.olDelta} style={{ color: deltaPositive ? 'var(--positive)' : 'var(--attention)' }}>
                {deltaPositive ? '▲' : '▼'} {Math.abs(olDelta)}{' '}
                <span className={styles.olVsLabel}>vs last quarter</span>
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div className={styles.sparklineWrap}>
          <Sparkline history={scoreHistory} />
        </div>
      </div>

      {/* Per-vector grid */}
      <div className={styles.vectorGridLabel}>Where each vector landed</div>
      <div className={styles.vectorGrid}>
        {vectors.map(v => {
          const vGoals = report.goals.filter(g => g.vectorId === v.id);
          const avgC   = vGoals.length > 0 ? vGoals.reduce((s, g) => s + g.c, 0) / vGoals.length : null;
          const avgGap = vGoals.length > 0 ? vGoals.reduce((s, g) => s + g.gap, 0) / vGoals.length : null;
          const cPct   = avgC != null ? Math.round(avgC * 100) : null;
          const gapPp  = avgGap != null ? Math.round(avgGap * 100) : null;
          const deltaColor = gapPp == null ? 'var(--ink-faint)'
            : gapPp >= 0 ? 'var(--positive)' : 'var(--attention)';
          const deltaText = gapPp == null ? '—'
            : gapPp >= 0 ? `▲ ${gapPp}pp` : `▼ ${Math.abs(gapPp)}pp`;
          return (
            <div key={v.id} className={styles.vectorGridRow}>
              <span className={styles.vectorGridSwatch} style={{ background: v.color }} />
              <span className={styles.vectorGridName}>{v.label}</span>
              <span className={styles.vectorGridScore}>{cPct != null ? `${cPct}%` : '—'}</span>
              <span className={styles.vectorGridDelta} style={{ color: deltaColor }}>{deltaText}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.scorecardFooter}>
        Lenna is walking this on the right → ask her anything about the quarter.
      </div>
    </div>
  );
}

// ── Drafts panel (center, replan/commit phase) ────────────────────────────────

function DraftsCenter({
  nextQuarter, vectors, draftGoals, skippedGoalVectors, removedVectors,
}: {
  nextQuarter:        string;
  vectors:            Vector[];
  draftGoals:         DraftGoal[];
  skippedGoalVectors: string[];
  removedVectors:     string[];
}) {
  const [nqYear, nqNum] = nextQuarter.split('-Q');
  return (
    <div className={sty.draftsPanel}>
      <div className={sty.draftsHeader}>Q{nqNum} {nqYear} — planning</div>
      <div className={sty.draftsList}>
        {vectors
          .filter(v => !removedVectors.includes(v.id))
          .map(v => {
            const vectorGoals = draftGoals.filter(g => g.vectorId === v.id);
            const skipped     = skippedGoalVectors.includes(v.id);
            return (
              <div key={v.id} className={sty.draftVector}>
                <div className={sty.draftVectorHead}>
                  <span className={sty.draftDot} style={{ background: v.color }} />
                  <span className={sty.draftVectorName}>{v.label}</span>
                </div>
                {vectorGoals.length > 0 ? (
                  vectorGoals.map(goal => (
                    <div key={goal.id} className={sty.draftGoal}>
                      <div className={sty.draftGoalDesc}>{goal.description}</div>
                      <div className={sty.draftGoalMeta}>
                        <span className={sty.draftTypeBadge}>{goal.type}</span>
                        <span className={sty.draftGoalSub}>{goalSubline(goal)}</span>
                      </div>
                    </div>
                  ))
                ) : skipped ? (
                  <div className={sty.draftSkipped}>sitting out this quarter</div>
                ) : (
                  <div className={sty.draftEmpty}>goal pending</div>
                )}
              </div>
            );
          })}
        {removedVectors.length > 0 && (
          <div className={sty.draftRemovedNote}>
            {removedVectors.join(', ')} removed from profile
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function ReviewSession({
  user, vectors, sessionId, closedQuarter, nextQuarter,
  phase: initialPhase, report, scoreHistory, olDelta, closedStart, closedEnd,
  existingDraftGoals,
}: Props) {
  const firstName         = user.name.trim().split(' ')[0] || 'you';
  const selectedVectors   = vectors.map(v => ({ id: v.id, label: v.label }));

  const [phase,              setPhase]              = useState(initialPhase);
  const [draftGoals,         setDraftGoals]         = useState<DraftGoal[]>(existingDraftGoals);
  const [skippedGoalVectors, setSkippedGoalVectors] = useState<string[]>([]);
  const [removedVectors,     setRemovedVectors]     = useState<string[]>([]);
  const [messages,           setMessages]           = useState<ChatMessage[]>([]);
  const [inputText,          setInputText]          = useState('');
  const [inputError,         setInputError]         = useState<string | null>(null);
  const [committing,         setCommitting]         = useState(false);
  const [pending,            startTransition]       = useTransition();
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    startTransition(async () => {
      const result = await reviewSessionTurn('__start__', [], sessionId, closedQuarter, nextQuarter, selectedVectors, [], []);
      if (result.reply)  setMessages([{ role: 'lenna', text: result.reply }]);
      if (result.phase)  setPhase(result.phase);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending) return;
    setInputError(null);

    const prev = [...messages];
    setMessages(m => [...m, { role: 'user', text }]);
    setInputText('');

    startTransition(async () => {
      const result = await reviewSessionTurn(
        text, prev, sessionId, closedQuarter, nextQuarter,
        selectedVectors, skippedGoalVectors, removedVectors,
      );
      if (result.error) { setInputError(result.error); setMessages(m => m.slice(0, -1)); return; }
      if (result.reply)      setMessages(m => [...m, { role: 'lenna', text: result.reply }]);
      if (result.phase)      setPhase(result.phase);
      if (result.draftGoals) setDraftGoals(result.draftGoals);
      if (result.skippedGoalVectors?.length)
        setSkippedGoalVectors(prev => [...new Set([...prev, ...result.skippedGoalVectors])]);
      if (result.removedVectors?.length)
        setRemovedVectors(prev => [...new Set([...prev, ...result.removedVectors])]);
    });
  }

  async function handleCommit() {
    if (committing) return;
    setCommitting(true);
    await commitReviewSession(sessionId);
  }

  const canCommit  = phase === 'commit' && !committing;
  const showReport = phase === 'report' || phase === 'discuss';

  const [cqYear, cqNum] = closedQuarter.split('-Q');
  const [nqYear, nqNum] = nextQuarter.split('-Q');

  void firstName; // used via lenna's greeting in reviewSessionTurn

  return (
    <div className={styles.shell}>

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

      {/* ── Center pane ── */}
      <div className={styles.center}>
        <div className={styles.centerHeader}>
          <Link href="/quarter" className={styles.backChip}>← Q{nqNum}</Link>
          <div>
            <div className={styles.centerTitle}>Reviewing · Q{cqNum} {cqYear}</div>
            <div className={styles.centerSub}>closed {closedEnd} · {closedStart}–{closedEnd}</div>
          </div>
        </div>

        {showReport ? (
          <ScoreCard
            report={report}
            vectors={vectors}
            olDelta={olDelta}
            scoreHistory={scoreHistory}
          />
        ) : (
          <>
            <DraftsCenter
              nextQuarter={nextQuarter}
              vectors={vectors.filter(v => !removedVectors.includes(v.id))}
              draftGoals={draftGoals}
              skippedGoalVectors={skippedGoalVectors}
              removedVectors={removedVectors}
            />
            <div className={sty.draftsFooter}>
              <button
                className={`${sty.commitBtn} ${canCommit ? sty.commitBtnReady : ''}`}
                onClick={handleCommit}
                disabled={!canCommit}
              >
                {committing ? 'Activating…' : `Confirm Q${nqNum} ${nqYear} →`}
              </button>
              {phase !== 'commit' && (
                <div className={sty.commitHint}>Lenna will confirm when everything is set.</div>
              )}
            </div>
          </>
        )}
      </div>

      <LennaPanel
        messages={messages as import('@/lib/llm/chat').ChatMessage[]}
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleSubmit}
        pending={pending}
        error={inputError}
        placeholder={showReport ? `Ask about Q${cqNum}…` : 'Ask Lenna about the plan…'}
        label={`Lenna · Q${cqNum} review`}
        chatEndRef={chatEndRef}
      />

    </div>
  );
}
