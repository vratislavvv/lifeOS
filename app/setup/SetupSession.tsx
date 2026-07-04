'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { VECTORS } from '@/lib/vectors';
import type { VectorKey } from '@/lib/vectors';
import { startSetupSession, setupSessionTurn, commitSetupSession } from './sessionActions';
import type { ChatMessage } from '@/lib/llm/setupChat';
import type { SetupData } from './types';
import { LennaText } from '@/lib/renderMarkdown';
import { goalSubline } from '@/lib/ui/goalSubline';
import styles from './session.module.css';

type Anchor = {
  id: string;
  vectorId: string;
  description: string;
  headlineMetric: string | null;
  targetAge: number | null;
};

type DraftGoal = {
  id: string;
  vectorId: string;
  description: string;
  type: string;
  startValue: number | null;
  targetValue: number | null;
  cadencePerWeek: number | null;
  paceShape: string;
};

type Props = {
  data: SetupData;
};

export default function SetupSession({ data }: Props) {
  const firstName      = data.name.trim().split(' ')[0] || 'you';
  const selectedVectors = data.vectors.map(k => ({ id: k, label: VECTORS[k].label }));

  const [sessionId,          setSessionId]          = useState<string | null>(null);
  const [quarter,            setQuarter]            = useState('');
  const [phase,              setPhase]              = useState('orient');
  const [anchors,            setAnchors]            = useState<Anchor[]>([]);
  const [draftGoals,         setDraftGoals]         = useState<DraftGoal[]>([]);
  const [skippedGoalVectors, setSkippedGoalVectors] = useState<string[]>([]);
  const [removedVectors,     setRemovedVectors]     = useState<string[]>([]);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [inputText,   setInputText]   = useState('');
  const [inputError,  setInputError]  = useState<string | null>(null);
  const [committing,  setCommitting]  = useState(false);
  const [pending,     startTransition] = useTransition();
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Start session + get opener
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    startTransition(async () => {
      const { sessionId: sid, quarter: q } = await startSetupSession(data);
      setSessionId(sid);
      setQuarter(q);

      // Lenna opens the conversation
      const result = await setupSessionTurn('__start__', [], sid, q, selectedVectors, [], []);
      if (result.reply) setMessages([{ role: 'lenna', text: result.reply }]);
      if (result.phase) setPhase(result.phase);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending || !sessionId) return;
    setInputError(null);

    const prevMessages = [...messages];
    setMessages(m => [...m, { role: 'user', text }]);
    setInputText('');

    startTransition(async () => {
      const result = await setupSessionTurn(text, prevMessages, sessionId, quarter, selectedVectors, skippedGoalVectors, removedVectors);
      if (result.error) {
        setInputError(result.error);
        setMessages(m => m.slice(0, -1));
        return;
      }
      if (result.reply)      setMessages(m => [...m, { role: 'lenna', text: result.reply }]);
      if (result.phase)      setPhase(result.phase);
      if (result.anchors)    setAnchors(result.anchors);
      if (result.draftGoals) setDraftGoals(result.draftGoals);
      setSkippedGoalVectors(result.skippedGoalVectors);
      setRemovedVectors(result.removedVectors);
    });
  }

  async function handleCommit() {
    if (!sessionId || committing) return;
    setCommitting(true);
    await commitSetupSession(sessionId);
  }

  const canCommit = phase === 'commit' && !committing;

  return (
    <div className={styles.session}>

      {/* ── Left: Lenna chat ── */}
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <span className={styles.chatLogo}>lifeOS</span>
          <span className={styles.chatPhase}>{phase}</span>
        </div>

        <div className={styles.chatBody}>
          {!sessionId && messages.length === 0 && (
            <div className={styles.chatLoading}>Starting session…</div>
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
          {inputError && (
            <div className={styles.chatError}>{inputError}</div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className={styles.chatInputWrap}>
          <textarea
            className={styles.chatInput}
            placeholder={sessionId ? 'Reply to Lenna…' : 'Starting…'}
            rows={2}
            value={inputText}
            disabled={pending || !sessionId}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {inputText.trim() && !pending && (
            <div className={styles.chatInputHint}>↵ send · shift+↵ newline</div>
          )}
        </div>
      </div>

      {/* ── Right: Session drafts ── */}
      <div className={styles.draftsPanel}>
        <div className={styles.draftsHeader}>This quarter</div>

        <div className={styles.draftsList}>
          {data.vectors
            .filter(key => !removedVectors.includes(key))
            .map(key => {
              const v       = VECTORS[key as VectorKey];
              const anchor      = anchors.find(a => a.vectorId === key);
              const vectorGoals = draftGoals.filter(g => g.vectorId === key);
              const skipped     = skippedGoalVectors.includes(key);

              return (
                <div key={key} className={styles.draftVector}>
                  <div className={styles.draftVectorHead}>
                    <span className={styles.draftDot} style={{ background: v.color }} />
                    <span className={styles.draftVectorName}>{v.label}</span>
                  </div>

                  {anchor ? (
                    <div className={styles.draftAnchor}>
                      <span className={styles.draftAnchorLabel}>anchor</span>
                      <span className={styles.draftAnchorText}>{anchor.description}</span>
                    </div>
                  ) : (
                    <div className={styles.draftEmpty}>anchor pending</div>
                  )}

                  {vectorGoals.length > 0 ? (
                    vectorGoals.map(goal => (
                      <div key={goal.id} className={styles.draftGoal}>
                        <div className={styles.draftGoalDesc}>{goal.description}</div>
                        <div className={styles.draftGoalMeta}>
                          <span className={styles.draftTypeBadge}>{goal.type}</span>
                          <span className={styles.draftGoalSub}>{goalSubline(goal)}</span>
                        </div>
                      </div>
                    ))
                  ) : skipped ? (
                    <div className={styles.draftSkipped}>sitting out this quarter</div>
                  ) : (
                    <div className={styles.draftEmpty}>goal pending</div>
                  )}
                </div>
              );
            })}
        </div>

        <div className={styles.draftsFooter}>
          <button
            className={`${styles.commitBtn} ${canCommit ? styles.commitBtnReady : ''}`}
            onClick={handleCommit}
            disabled={!canCommit}
          >
            {committing ? 'Activating…' : 'Confirm & Start →'}
          </button>
          {phase !== 'commit' && (
            <div className={styles.commitHint}>
              Lenna unlocks this once all vectors are resolved.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
