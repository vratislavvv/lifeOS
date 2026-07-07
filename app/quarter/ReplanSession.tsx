'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { QuarterReport } from '@/lib/scoring/quarterReport';
import type { vectors, user } from '@/lib/db/schema';
import type { ChatMessage } from '@/lib/llm/chat';
import styles from './review.module.css';
import LennaPanel from '@/components/LennaPanel';
import { sendToLenna } from '@/app/today/actions';

type User   = typeof user.$inferSelect;
type Vector = typeof vectors.$inferSelect;

type Props = {
  user:          User;
  vectors:       Vector[];
  report:        QuarterReport;
  scoreHistory:  { date: string; ol: number }[];
  olDelta:       number | null;
  closedStart:   string;
  closedEnd:     string;
  closedQuarter: string;
  currentQuarter: string;
};

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


export default function ReplanSession({
  vectors, report, scoreHistory, olDelta,
  closedStart, closedEnd, closedQuarter, currentQuarter,
}: Props) {
  const [cqYear, cqNum] = closedQuarter.split('-Q');
  const [, nqNum]       = currentQuarter.split('-Q');
  const prevQNum        = parseInt(cqNum) - 1;

  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [inputText,  setInputText]  = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending) return;
    setInputError(null);
    const prev = [...messages];
    setMessages(m => [...m, { role: 'user', text }]);
    setInputText('');
    startTransition(async () => {
      const result = await sendToLenna(text, prev);
      if (result.error) { setInputError(result.error); setMessages(m => m.slice(0, -1)); }
      else if (result.reply) setMessages(m => [...m, { role: 'lenna', text: result.reply! }]);
    });
  }

  const olLast         = report.olLast != null ? Math.round(report.olLast) : null;
  const deltaPositive  = (olDelta ?? 0) >= 0;

  // Per-vector stats
  const vectorStats = vectors.map(v => {
    const vGoals = report.goals.filter(g => g.vectorId === v.id);
    const avgC   = vGoals.length > 0 ? vGoals.reduce((s, g) => s + g.c, 0) / vGoals.length : null;
    const avgGap = vGoals.length > 0 ? vGoals.reduce((s, g) => s + g.gap, 0) / vGoals.length : null;
    const cPct   = avgC   != null ? Math.round(avgC   * 100) : null;
    const gapPp  = avgGap != null ? Math.round(avgGap * 100) : null;
    return { v, cPct, gapPp };
  });

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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75, marginRight: 7 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>

      {/* ── Center: scorecard ── */}
      <div className={styles.center}>
        <div className={styles.centerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Link href="/quarter" className={styles.backChip}>← Q{nqNum}</Link>
            <div>
              <div className={styles.centerTitle}>Reviewing · Q{cqNum} {cqYear}</div>
              <div className={styles.centerSub}>closed {closedEnd} · {closedStart}–{closedEnd}</div>
            </div>
          </div>
        </div>

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
                    <span className={styles.olVsLabel}>vs Q{prevQNum}</span>
                  </span>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div className={styles.sparklineWrap}>
              <Sparkline history={scoreHistory} />
            </div>
          </div>

          {/* Vector grid */}
          <div className={styles.vectorGridLabel}>Where each vector landed</div>
          <div className={styles.vectorGrid}>
            {vectorStats.map(({ v, cPct, gapPp }) => {
              const deltaColor = gapPp == null ? 'var(--ink-faint)'
                : gapPp >= 0 ? 'var(--positive)' : 'var(--attention)';
              const deltaText  = gapPp == null ? '—'
                : gapPp >= 0 ? `▲ ${gapPp}` : `▼ ${Math.abs(gapPp)}`;
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
            <Link href="/quarter" className={styles.railActionBtnPrimary}>Open Q{nqNum} board</Link>
            <Link href="/quarter/review" className={styles.railActionBtnSecondary}>Full report →</Link>
          </div>
        </div>
      </div>

      <LennaPanel
        messages={messages}
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleSubmit}
        pending={pending}
        error={inputError}
        placeholder={`Ask about Q${cqNum}…`}
        label={`Lenna · Q${cqNum}`}
        chatEndRef={chatEndRef}
      />

    </div>
  );
}
