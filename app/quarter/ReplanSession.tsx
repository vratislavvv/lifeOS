'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { LennaText } from '@/lib/renderMarkdown';
import { goalSubline } from '@/lib/ui/goalSubline';
import { replanSessionTurn, commitReplanSession } from './replanActions';
import type { ChatMessage } from '@/lib/llm/replanChat';
import type { vectors, goals, user } from '@/lib/db/schema';
import styles from '../setup/session.module.css';

type User   = typeof user.$inferSelect;
type Vector = typeof vectors.$inferSelect;

type ActiveGoal = {
  id:          string;
  vectorId:    string;
  description: string;
  type:        string;
};

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
  currentQuarter:     string;
  phase:              string;
  activeGoals:        ActiveGoal[];
  existingDraftGoals: DraftGoal[];
};

// ── Goals panel (right side) ──────────────────────────────────────────────────

function GoalsPanel({
  currentQuarter,
  vectors,
  activeGoals,
  draftGoals,
  abandonedGoalIds,
  skippedGoalVectors,
  removedVectors,
}: {
  currentQuarter:     string;
  vectors:            Vector[];
  activeGoals:        ActiveGoal[];
  draftGoals:         DraftGoal[];
  abandonedGoalIds:   string[];
  skippedGoalVectors: string[];
  removedVectors:     string[];
}) {
  const [qYear, qNum] = currentQuarter.split('-Q');

  return (
    <div className={styles.draftsPanel}>
      <div className={styles.draftsHeader}>Q{qNum} {qYear} — goals</div>
      <div className={styles.draftsList}>
        {vectors
          .filter(v => !removedVectors.includes(v.id))
          .map(v => {
            const active   = activeGoals.find(g => g.vectorId === v.id);
            const draft    = draftGoals.find(g => g.vectorId === v.id);
            const abandoned = active && abandonedGoalIds.includes(active.id);
            const skipped  = skippedGoalVectors.includes(v.id);

            return (
              <div key={v.id} className={styles.draftVector}>
                <div className={styles.draftVectorHead}>
                  <span className={styles.draftDot} style={{ background: v.color }} />
                  <span className={styles.draftVectorName}>{v.label}</span>
                </div>

                {/* Current active goal — show with abandoning overlay if marked */}
                {active && (
                  <div
                    className={styles.draftGoal}
                    style={abandoned ? { opacity: 0.4, textDecoration: 'line-through' } : undefined}
                  >
                    <div className={styles.draftGoalDesc}>{active.description}</div>
                    <div className={styles.draftGoalMeta}>
                      <span className={styles.draftTypeBadge}>{active.type}</span>
                      {abandoned && (
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--attention)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', textDecoration: 'none' }}>
                          abandoning
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* New draft goal replacing it */}
                {draft && (
                  <div className={styles.draftGoal} style={{ border: '1px solid var(--hairline-strong)', background: 'var(--surface)' }}>
                    <div className={styles.draftGoalDesc}>{draft.description}</div>
                    <div className={styles.draftGoalMeta}>
                      <span className={styles.draftTypeBadge}>{draft.type}</span>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--positive, #3d9e5f)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        new
                      </span>
                      <span className={styles.draftGoalSub}>{goalSubline(draft)}</span>
                    </div>
                  </div>
                )}

                {/* No active goal and no draft */}
                {!active && !draft && !skipped && (
                  <div className={styles.draftEmpty}>no active goal</div>
                )}

                {skipped && !draft && (
                  <div className={styles.draftSkipped}>sitting out this quarter</div>
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

export default function ReplanSession({
  user, vectors, sessionId, currentQuarter, phase: initialPhase,
  activeGoals, existingDraftGoals,
}: Props) {
  const firstName       = user.name.trim().split(' ')[0] || 'you';
  const selectedVectors = vectors.map(v => ({ id: v.id, label: v.label }));

  const [phase,              setPhase]              = useState(initialPhase);
  const [draftGoals,         setDraftGoals]         = useState<DraftGoal[]>(existingDraftGoals);
  const [abandonedGoalIds,   setAbandonedGoalIds]   = useState<string[]>([]);
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
      const result = await replanSessionTurn('__start__', [], sessionId, currentQuarter, selectedVectors, [], [], []);
      if (result.reply) setMessages([{ role: 'lenna', text: result.reply }]);
      if (result.phase) setPhase(result.phase);
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
      const result = await replanSessionTurn(
        text, prev, sessionId, currentQuarter,
        selectedVectors, abandonedGoalIds, skippedGoalVectors, removedVectors,
      );
      if (result.error) { setInputError(result.error); setMessages(m => m.slice(0, -1)); return; }
      if (result.reply) setMessages(m => [...m, { role: 'lenna', text: result.reply }]);
      if (result.phase) setPhase(result.phase);
      if (result.draftGoals)       setDraftGoals(result.draftGoals);
      if (result.abandonedGoalIds.length) setAbandonedGoalIds(result.abandonedGoalIds);
      if (result.skippedGoalVectors.length) setSkippedGoalVectors(prev => [...new Set([...prev, ...result.skippedGoalVectors])]);
      if (result.removedVectors.length)     setRemovedVectors(prev => [...new Set([...prev, ...result.removedVectors])]);
    });
  }

  async function handleCommit() {
    if (committing) return;
    setCommitting(true);
    await commitReplanSession(sessionId);
  }

  const canCommit = phase === 'commit' && !committing;
  const [qYear, qNum] = currentQuarter.split('-Q');

  return (
    <div className={styles.session}>

      {/* ── Left: Lenna chat ── */}
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <span className={styles.chatLogo}>lifeOS</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
              Q{qNum} {qYear} replan
            </span>
            <span className={styles.chatPhase}>{phase}</span>
          </div>
        </div>

        <div className={styles.chatBody}>
          {messages.length === 0 && (
            <div className={styles.chatLoading}>Starting replan…</div>
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
            placeholder={`Tell Lenna what's changed, ${firstName}…`}
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

      {/* ── Right: goals state panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <GoalsPanel
          currentQuarter={currentQuarter}
          vectors={vectors}
          activeGoals={activeGoals}
          draftGoals={draftGoals}
          abandonedGoalIds={abandonedGoalIds}
          skippedGoalVectors={skippedGoalVectors}
          removedVectors={removedVectors}
        />
        <div className={styles.draftsFooter}>
          <button
            className={`${styles.commitBtn} ${canCommit ? styles.commitBtnReady : ''}`}
            onClick={handleCommit}
            disabled={!canCommit}
          >
            {committing ? 'Activating…' : 'Confirm changes →'}
          </button>
          {phase !== 'commit' && (
            <div className={styles.commitHint}>
              Lenna will confirm when everything is set.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
