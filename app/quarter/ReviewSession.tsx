'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { LennaText } from '@/lib/renderMarkdown';
import { goalSubline } from '@/lib/ui/goalSubline';
import { reviewSessionTurn, commitReviewSession } from './reviewActions';
import type { QuarterReport } from '@/lib/scoring/quarterReport';
import type { ChatMessage } from '@/lib/llm/reviewChat';
import type { vectors, goals, user } from '@/lib/db/schema';
import styles from '../setup/session.module.css';
import rstyles from './review.module.css';

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
  existingDraftGoals: DraftGoal[];
};

function olLabel(ol: number | null) {
  return ol != null ? String(Math.round(ol)) : '—';
}

// ── Right panel: report summary during report/discuss ─────────────────────────

function ReportPanel({ report, closedQuarter }: { report: QuarterReport; closedQuarter: string }) {
  const [cqYear, cqNum] = closedQuarter.split('-Q');
  const label = `Q${cqNum} ${cqYear}`;

  return (
    <div className={rstyles.reportPanel}>
      <div className={rstyles.reportHeader}>{label} — final state</div>

      <div className={rstyles.reportBody}>
        {/* OL arc */}
        <div className={rstyles.reportSection}>
          <div className={rstyles.reportSectionLabel}>Operating Level</div>
          {report.olFirst != null ? (
            <div className={rstyles.olArc}>
              <span className={rstyles.olVal}>{olLabel(report.olFirst)}</span>
              <span className={rstyles.olArrow}>→</span>
              <span className={rstyles.olVal}>{olLabel(report.olLast)}</span>
              <span className={rstyles.olMeta}>
                ↑{olLabel(report.olHigh)} ↓{olLabel(report.olLow)}
              </span>
            </div>
          ) : (
            <div className={rstyles.reportEmpty}>no score data</div>
          )}
        </div>

        {/* Per-goal */}
        {report.goals.length > 0 && (
          <div className={rstyles.reportSection}>
            <div className={rstyles.reportSectionLabel}>Goals</div>
            {report.goals.map(g => {
              const cPct  = Math.round(g.c * 100);
              const ePct  = Math.round(g.e * 100);
              const ahead = g.gap >= 0;
              const gapPct = Math.round(Math.abs(g.gap) * 100);
              return (
                <div key={g.goalId} className={rstyles.reportGoal}>
                  <div className={rstyles.reportGoalDesc}>{g.description}</div>
                  <div className={rstyles.reportGoalMeta}>
                    <span className={rstyles.reportGoalType}>{g.type}</span>
                    <span className={`${rstyles.reportGoalGap} ${ahead ? rstyles.ahead : rstyles.behind}`}>
                      {ahead ? '+' : '−'}{gapPct}pp
                    </span>
                    <span className={rstyles.reportGoalNums}>c {cPct}% · e {ePct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Activity */}
        <div className={rstyles.reportSection}>
          <div className={rstyles.reportSectionLabel}>Activity</div>
          <div className={rstyles.reportActivity}>
            <span>{report.daysActive} active days</span>
            <span>·</span>
            <span>{report.totalInputs} inputs</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right panel: draft goals during replan/commit ─────────────────────────────

function DraftsPanel({
  nextQuarter, vectors, draftGoals, skippedGoalVectors, removedVectors,
}: {
  nextQuarter:        string;
  vectors:            Vector[];
  draftGoals:         DraftGoal[];
  skippedGoalVectors: string[];
  removedVectors:     string[];
}) {
  const [nqYear, nqNum] = nextQuarter.split('-Q');
  const label = `Q${nqNum} ${nqYear}`;

  return (
    <div className={styles.draftsPanel}>
      <div className={styles.draftsHeader}>{label} — planning</div>
      <div className={styles.draftsList}>
        {vectors
          .filter(v => !removedVectors.includes(v.id))
          .map(v => {
            const goal    = draftGoals.find(g => g.vectorId === v.id);
            const skipped = skippedGoalVectors.includes(v.id);
            return (
              <div key={v.id} className={styles.draftVector}>
                <div className={styles.draftVectorHead}>
                  <span className={styles.draftDot} style={{ background: v.color }} />
                  <span className={styles.draftVectorName}>{v.label}</span>
                </div>
                {goal ? (
                  <div className={styles.draftGoal}>
                    <div className={styles.draftGoalDesc}>{goal.description}</div>
                    <div className={styles.draftGoalMeta}>
                      <span className={styles.draftTypeBadge}>{goal.type}</span>
                      <span className={styles.draftGoalSub}>{goalSubline(goal)}</span>
                    </div>
                  </div>
                ) : skipped ? (
                  <div className={styles.draftSkipped}>sitting out this quarter</div>
                ) : (
                  <div className={styles.draftEmpty}>goal pending</div>
                )}
              </div>
            );
          })}
        {removedVectors.length > 0 && (
          <div className={styles.draftRemovedNote}>
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
  phase: initialPhase, report, existingDraftGoals,
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

  // Kick off Lenna's opening message
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

  const canCommit = phase === 'commit' && !committing;
  const showReport = phase === 'report' || phase === 'discuss';

  const [cqYear, cqNum] = closedQuarter.split('-Q');
  const [nqYear, nqNum] = nextQuarter.split('-Q');

  return (
    <div className={styles.session}>

      {/* ── Left: Lenna chat ── */}
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <span className={styles.chatLogo}>lifeOS</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
              Q{cqNum} {cqYear} review
            </span>
            <span className={styles.chatPhase}>{phase}</span>
          </div>
        </div>

        <div className={styles.chatBody}>
          {messages.length === 0 && (
            <div className={styles.chatLoading}>Starting review…</div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className={styles.chatUser}>{m.text}</div>
            ) : (
              <div key={i} className={styles.chatLenna}>
                <div className={styles.chatLennaLabel}>lenna</div>
                <LennaText text={m.text} className={styles.chatLennaText} />
              </div>
            )
          )}
          {pending && (
            <div className={styles.chatLenna}>
              <div className={styles.chatLennaLabel}>lenna</div>
              <div className={`${styles.chatLennaText} ${styles.chatPending}`}>…</div>
            </div>
          )}
          {inputError && <div className={styles.chatError}>{inputError}</div>}
          <div ref={chatEndRef} />
        </div>

        <div className={styles.chatInputWrap}>
          <textarea
            className={styles.chatInput}
            placeholder="Reply to Lenna…"
            rows={2}
            value={inputText}
            disabled={pending}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
          />
          {inputText.trim() && !pending && (
            <div className={styles.chatInputHint}>↵ send · shift+↵ newline</div>
          )}
        </div>
      </div>

      {/* ── Right: report summary or draft goals ── */}
      {showReport ? (
        <ReportPanel report={report} closedQuarter={closedQuarter} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DraftsPanel
            nextQuarter={nextQuarter}
            vectors={vectors.filter(v => !removedVectors.includes(v.id))}
            draftGoals={draftGoals}
            skippedGoalVectors={skippedGoalVectors}
            removedVectors={removedVectors}
          />
          <div className={styles.draftsFooter}>
            <button
              className={`${styles.commitBtn} ${canCommit ? styles.commitBtnReady : ''}`}
              onClick={handleCommit}
              disabled={!canCommit}
            >
              {committing ? 'Activating…' : `Confirm Q${nqNum} ${nqYear} →`}
            </button>
            {phase !== 'commit' && (
              <div className={styles.commitHint}>
                Lenna will confirm when everything is set.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
