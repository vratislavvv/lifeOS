'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import styles from './quarter.module.css';
import { sendToLenna } from '@/app/today/actions';
import type { ChatMessage } from '@/lib/llm/chat';
import type { vectors, goals, scores, user } from '@/lib/db/schema';

type User     = typeof user.$inferSelect;
type Vector   = typeof vectors.$inferSelect;
type Score    = typeof scores.$inferSelect;
type GoalCard = typeof goals.$inferSelect & { c: number; e: number; gap: number };

type Props = {
  user: User;
  vectors: Vector[];
  goalCards: GoalCard[];
  scoreTrend: { date: string; ol: number }[];
  latestScore: Score | null;
  quarter: string;
  tau: number;
  quarterStart: string;
  quarterEnd: string;
  daysLeft: number;
};

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: { date: string; ol: number }[] }) {
  if (points.length < 2) {
    return <div className={styles.sparkEmpty}>no data yet</div>;
  }
  const W = 120, H = 40;
  const dates = points.map(p => new Date(p.date + 'T00:00:00').getTime());
  const minD  = dates[0], maxD = dates[dates.length - 1];
  const rangeD = maxD - minD || 1;

  const coords = points.map((p, i) => {
    const x = ((dates[i] - minD) / rangeD) * (W - 6) + 3;
    const y = H - 4 - (p.ol / 100) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={W} height={H} className={styles.sparkSvg}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="var(--ink-soft)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Goal card ────────────────────────────────────────────────────────────────

function GoalRow({ g, tau }: { g: GoalCard; tau: number }) {
  const ahead  = g.gap >= 0;
  const cPct   = Math.round(g.c   * 100);
  const ePct   = Math.round(g.e   * 100);
  const gapPct = Math.round(Math.abs(g.gap) * 100);

  return (
    <div className={styles.goalCard}>
      <div className={styles.goalDesc}>{g.description}</div>
      <div className={styles.goalMeta}>
        <span className={styles.typeBadge}>{g.type}</span>
        <span className={`${styles.gapBadge} ${ahead ? styles.gapAhead : styles.gapBehind}`}>
          {ahead ? '+' : '−'}{gapPct}pp
        </span>
      </div>
      <div className={styles.goalTrackWrap}>
        <div className={styles.goalTrackBg} />
        <div className={styles.goalFill} style={{ width: `${g.c * 100}%` }} />
        <div className={styles.goalPaceTick} style={{ left: `${g.e * 100}%` }} />
      </div>
      <div className={styles.goalNums}>
        <span className={styles.goalC}>c {cPct}%</span>
        <span className={styles.goalSep}>·</span>
        <span className={styles.goalE}>e {ePct}%</span>
      </div>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export default function QuarterShell({
  user, vectors, goalCards, scoreTrend, latestScore,
  quarter, tau, quarterStart, quarterEnd, daysLeft,
}: Props) {
  const [qYear, qNum]  = quarter.split('-Q');
  const quarterLabel   = `Q${qNum} ${qYear}`;
  const firstName      = user.name.trim().split(' ')[0] || 'you';

  const [inputText,  setInputText]  = useState('');
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [lennaOpen,  setLennaOpen]  = useState(false);
  const [lennaWidth, setLennaWidth] = useState(260);
  const [pending,    startTransition] = useTransition();
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const dragging    = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setLennaWidth(Math.min(Math.max(window.innerWidth - e.clientX, 180), 520));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
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
      const res = await sendToLenna(text, prev);
      if (res.error) { setInputError(res.error); setMessages(m => m.slice(0, -1)); }
      else if (res.reply) setMessages(m => [...m, { role: 'lenna', text: res.reply! }]);
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
              <Link href="/today" className={styles.navLink}>Today</Link>
            </div>
            <div className={styles.navItem}>
              <div className={`${styles.navLink} ${styles.navLinkActive}`}>Quarter</div>
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

      {/* ── Main ── */}
      <main className={styles.content}>

        {/* Header */}
        <div className={styles.contentHeader}>
          <div>
            <div className={styles.headerTitle}>{quarterLabel}</div>
            <div className={styles.headerDate}>{quarterStart} → {quarterEnd}</div>
          </div>
          <div className={styles.headerScore}>
            <div className={`${styles.scoreNum} ${latestScore ? styles.scoreNumSet : ''}`}>
              {latestScore ? Math.round(latestScore.operatingLevel) : '—'}
            </div>
            <div className={styles.scoreLabel}>operating level</div>
          </div>
        </div>

        {/* Row 1: τ bar + OL sparkline */}
        <div className={styles.row}>
          <div className={`${styles.island} ${styles.tauIsland}`}>
            <div className={styles.islandLabel}>Quarter progress</div>
            <div className={styles.tauTrack}>
              <div className={styles.tauFill} style={{ width: `${tau * 100}%` }} />
            </div>
            <div className={styles.tauMeta}>
              <span className={styles.tauPct}>{Math.round(tau * 100)}%</span>
              <span className={styles.tauDays}>{daysLeft} days left</span>
            </div>
          </div>

          <div className={`${styles.island} ${styles.olIsland}`}>
            <div className={styles.islandLabel}>Trend</div>
            <Sparkline points={scoreTrend} />
          </div>
        </div>

        {/* Vector sections */}
        <div className={styles.vectorSections}>
          {vectors.map(v => {
            const vGoals = goalCards.filter(g => g.vectorId === v.id);
            const avgGap = vGoals.length > 0
              ? vGoals.reduce((s, g) => s + g.gap, 0) / vGoals.length
              : null;
            const ahead = avgGap !== null && avgGap >= 0;

            return (
              <div key={v.id} className={styles.vectorSection}>
                <div className={styles.vectorSectionHead}>
                  <span className={styles.vdot} style={{ background: v.color }} />
                  <span className={styles.vsectionLabel}>{v.label}</span>
                  {avgGap !== null && (
                    <span className={`${styles.vecGapBadge} ${ahead ? styles.vecGapAhead : styles.vecGapBehind}`}>
                      {ahead ? '+' : '−'}{Math.round(Math.abs(avgGap) * 100)}pp
                    </span>
                  )}
                </div>
                {vGoals.length === 0 ? (
                  <div className={styles.noGoal}>No active goal this quarter</div>
                ) : (
                  vGoals.map(g => <GoalRow key={g.id} g={g} tau={tau} />)
                )}
              </div>
            );
          })}
        </div>

      </main>

      {/* ── Resize handle ── */}
      <div
        className={styles.resizeHandle}
        onMouseDown={e => {
          e.preventDefault();
          dragging.current = true;
          document.body.style.cursor      = 'col-resize';
          document.body.style.userSelect  = 'none';
        }}
      >
        <div className={styles.handleDots}>
          <div className={styles.handleDot} />
          <div className={styles.handleDot} />
          <div className={styles.handleDot} />
        </div>
      </div>

      {/* ── Lenna ── */}
      {lennaOpen ? (
        <aside className={styles.assistant} style={{ width: lennaWidth }}>
          <div className={styles.assistantHeader}>
            <span className={styles.assistantTitle}>Lenna</span>
            <button className={styles.assistantCollapse} onClick={() => setLennaOpen(false)} title="Close Lenna">←</button>
          </div>

          <div className={styles.assistantBody}>
            {messages.length === 0 ? (
              <div className={styles.chatLenna}>
                <div className={styles.chatLennaLabel}>lenna</div>
                <div className={styles.chatLennaText}>
                  {`${quarterLabel} overview. What do you want to dig into, ${firstName}?`}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className={styles.chatUser}>{m.text}</div>
                ) : (
                  <div key={i} className={styles.chatLenna}>
                    <div className={styles.chatLennaLabel}>lenna</div>
                    <div className={styles.chatLennaText}>{m.text}</div>
                  </div>
                )
              )
            )}
            {pending && (
              <div className={styles.chatLenna}>
                <div className={styles.chatLennaLabel}>lenna</div>
                <div className={`${styles.chatLennaText} ${styles.chatPending}`}>…</div>
              </div>
            )}
            {inputError && (
              <div style={{ fontSize: 11, color: 'var(--attention)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                {inputError}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className={styles.assistantInputWrap}>
            <textarea
              className={styles.assistantInput}
              placeholder="Ask about this quarter…"
              rows={2}
              value={inputText}
              disabled={pending}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
            />
            {inputText.trim() && !pending && (
              <div className={styles.assistantInputHint}>↵ send · shift+↵ newline</div>
            )}
          </div>
        </aside>
      ) : (
        <div className={styles.lennaStrip} onClick={() => setLennaOpen(true)} title="Open Lenna">
          <span className={styles.lennaStripLabel}>Lenna →</span>
        </div>
      )}

    </div>
  );
}
