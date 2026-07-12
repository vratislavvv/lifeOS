'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './today.module.css';
import { eventsOnDate, type CalEvent } from '@/lib/google/calendar';

const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekStart(d: Date): Date {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s    = new Date(d);
  s.setDate(d.getDate() + diff);
  return s;
}

function weekSubtitle(today: Date): string {
  const s = getWeekStart(today);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  if (s.getMonth() === e.getMonth())
    return `${MONTHS[s.getMonth()]} · ${s.getDate()}–${e.getDate()}`;
  return `${MON_SHORT[s.getMonth()]} ${s.getDate()} – ${MON_SHORT[e.getMonth()]} ${e.getDate()}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export type LogEntry = {
  id:           string;
  date:         string;   // YYYY-MM-DD
  time:         string;   // HH:MM
  description:  string;
  vectorColor:  string;
  vectorLabel:  string;
};

function entriesOnDate(entries: LogEntry[], d: Date): LogEntry[] {
  const key = d.toLocaleDateString('en-CA');
  return entries.filter(e => e.date === key);
}

type PopupState = { date: Date; x: number; y: number; flipLeft: boolean };

export default function CalSection({
  weekStart,
  events = [],
  logEntries = [],
}: {
  weekStart:    'mon' | 'sun';
  events?:      CalEvent[];
  logEntries?:  LogEntry[];
}) {
  const today = new Date();

  const [monthOpen,   setMonthOpen]   = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [popup,       setPopup]       = useState<PopupState | null>(null);

  const closePopup = useCallback(() => setPopup(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePopup(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePopup]);

  /* ── Week strip ── */
  const weekStartDate = getWeekStart(today);
  if (weekStart === 'sun') weekStartDate.setDate(weekStartDate.getDate() - 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    return d;
  });

  /* ── Month grid ── */
  const base        = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year        = base.getFullYear();
  const month       = base.getMonth();
  const firstDow    = new Date(year, month, 1).getDay();
  const gridStart   = firstDow === 0 ? -6 : 1 - firstDow;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays    = new Date(year, month, 0).getDate();
  const totalCells  = Math.ceil((-gridStart + daysInMonth) / 7) * 7;

  const monthCells = Array.from({ length: totalCells }, (_, i) => {
    const n = i + gridStart + 1;
    let d: Date; let isOther = false;
    if (n < 1)              { d = new Date(year, month - 1, prevDays + n); isOther = true; }
    else if (n > daysInMonth) { d = new Date(year, month + 1, n - daysInMonth); isOther = true; }
    else                       d = new Date(year, month, n);
    return { d, isOther };
  });

  const activityCount = monthCells.filter(
    ({ isOther, d }) => !isOther && eventsOnDate(events, d).length > 0
  ).length;

  /* ── Cell click → popup ── */
  function handleCellClick(d: Date, isOther: boolean, e: React.MouseEvent) {
    if (isOther) return;
    if (popup?.date.toDateString() === d.toDateString()) { closePopup(); return; }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const PW = 296, PH = 380;

    let x = rect.right + 10, flipLeft = false;
    if (x + PW > vw - 16) { x = rect.left - PW - 10; flipLeft = true; }
    let y = rect.top;
    if (y + PH > vh - 16) y = Math.max(8, vh - PH - 16);

    setPopup({ date: d, x, y, flipLeft });
  }

  const popupEvts      = popup ? eventsOnDate(events, popup.date) : [];
  const popupEntries   = popup ? entriesOnDate(logEntries, popup.date) : [];
  const popupWeekday   = popup ? DAYS_LONG[popup.date.getDay()] : '';
  const popupDateLabel = popup ? `${popup.date.getDate()} ${MONTHS[popup.date.getMonth()]}` : '';

  return (
    <div className={styles.calSection}>

      {/* ── Header ── */}
      <div className={styles.calHeader}>
        <div className={styles.calTitleGroup}>
          {monthOpen ? (
            <div>
              <div className={styles.calTitleMain}>{MONTHS[month]} {year}</div>
              <div className={styles.calTitleSub}>{daysInMonth} days · {activityCount} with activity</div>
            </div>
          ) : (
            <>
              <span className={styles.calTitle}>Calendar</span>
              <span className={styles.calSubtitle}>{weekSubtitle(today)}</span>
            </>
          )}
        </div>
        <div className={styles.calControls}>
          {monthOpen && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <button type="button" className={styles.calNavBtn}
                onClick={() => { setMonthOffset(o => o - 1); closePopup(); }}>‹</button>
              <button type="button" className={styles.calNavBtn}
                onClick={() => { setMonthOffset(o => o + 1); closePopup(); }}>›</button>
            </div>
          )}
          <button type="button" className={styles.toggleBtn}
            onClick={() => { setMonthOpen(o => !o); closePopup(); }}>
            {monthOpen ? 'Collapse' : 'Month'}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
              {monthOpen
                ? <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* ── Week strip ── */}
      <div className={`${styles.calWeekOuter} ${monthOpen ? styles.calWeekOuterHidden : ''}`}>
        <div className={styles.calWeekInner}>
          <div className={styles.weekStrip}>
            {weekDays.map((d, i) => {
              const isToday      = d.toDateString() === today.toDateString();
              const isWeekend    = d.getDay() === 0 || d.getDay() === 6;
              const isSelected   = popup?.date.toDateString() === d.toDateString();
              const dayEvts      = eventsOnDate(events, d);
              const dayEntries   = entriesOnDate(logEntries, d);
              // One dot per unique vector color
              const vecDots = [...new Map(dayEntries.map(e => [e.vectorColor, e])).values()];
              const allDots = [...dayEvts.map(e => ({ key: e.id, color: '#4285F4', title: e.title })),
                               ...vecDots.map(e => ({ key: e.id, color: e.vectorColor, title: e.vectorLabel }))];
              const hasActivity = allDots.length > 0;
              return (
                <div
                  key={i}
                  className={[
                    styles.dayCell,
                    isToday    ? styles.dayCellToday    : '',
                    isWeekend  ? styles.dayCellWeekend  : '',
                    isSelected ? styles.dayCellSelected : '',
                  ].join(' ')}
                  onClick={e => handleCellClick(d, false, e)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={styles.dayDname}>{DAYS_SHORT[d.getDay()]}</span>
                  <span className={styles.dayNum}>{d.getDate()}</span>
                  <div className={styles.dayDots}>
                    {!hasActivity
                      ? <div className={styles.dayEmpty} />
                      : <>
                          {allDots.slice(0, 4).map((dot, idx) => (
                            <div
                              key={idx}
                              className={styles.eventDot}
                              style={{ background: dot.color }}
                              title={dot.title}
                            />
                          ))}
                          {allDots.length > 4 && (
                            <span className={styles.eventDotMore}>+{allDots.length - 4}</span>
                          )}
                        </>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Month grid ── */}
      <div className={`${styles.calMonthOuter} ${monthOpen ? styles.calMonthOuterOpen : ''}`}>
        <div className={styles.calMonthInner}>
          <div className={styles.weekdayHeader}>
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
              <div key={d} className={styles.wdLabel}>{d}</div>
            ))}
          </div>
          <div className={styles.monthGrid}>
            {monthCells.map(({ d, isOther }, i) => {
              const isToday      = d.toDateString() === today.toDateString();
              const isSelected   = popup?.date.toDateString() === d.toDateString();
              const dayEvts      = isOther ? [] : eventsOnDate(events, d);
              const dayEntries   = isOther ? [] : entriesOnDate(logEntries, d);
              const vecDots      = [...new Map(dayEntries.map(e => [e.vectorColor, e])).values()];
              return (
                <div
                  key={i}
                  className={[
                    styles.monthCell,
                    isOther    ? styles.monthCellOther    : '',
                    isToday    ? styles.monthCellToday    : '',
                    isSelected ? styles.monthCellSelected : '',
                  ].join(' ')}
                  onClick={e => handleCellClick(d, isOther, e)}
                >
                  <div className={styles.monthCellHeader}>
                    <span className={styles.monthNum}>{d.getDate()}</span>
                    {vecDots.length > 0 && (
                      <div className={styles.calLogDots}>
                        {vecDots.map((e, idx) => (
                          <div key={idx} className={styles.calLogDot} style={{ background: e.vectorColor }} title={e.vectorLabel} />
                        ))}
                      </div>
                    )}
                  </div>
                  {dayEvts.slice(0, 2).map(evt => (
                    <div key={evt.id} className={styles.calChip} title={evt.title}>
                      {evt.title}
                    </div>
                  ))}
                  {dayEvts.length > 2 && (
                    <div className={styles.calChipMore}>+{dayEvts.length - 2} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Popup ── */}
      {popup && (
        <>
          <div className={styles.popupOverlay} onClick={closePopup} />
          <div className={styles.popup} style={{ left: popup.x, top: popup.y }}>
            <div className={`${styles.popupPointer} ${popup.flipLeft ? styles.popupPointerRight : styles.popupPointerLeft}`} />

            <div className={styles.popupHeader}>
              <div className={styles.popupWeekday}>{popupWeekday}</div>
              <div className={styles.popupDate}>{popupDateLabel}</div>
            </div>

            <div className={styles.popupBody}>
              {(popupEvts.length > 0 || popupEntries.length === 0) && (
                <>
                  <div className={styles.popupCaption}>SCHEDULE</div>
                  {popupEvts.length === 0 ? (
                    <div className={styles.popupEmpty}>No events</div>
                  ) : popupEvts.map(evt => (
                    <div key={evt.id} className={styles.popupEventRow}>
                      <span className={styles.popupTime}>
                        {evt.allDay ? 'All day' : `${fmtTime(evt.start)}–${fmtTime(evt.end)}`}
                      </span>
                      <span className={styles.popupEventDot} />
                      <span className={styles.popupEventTitle}>{evt.title}</span>
                    </div>
                  ))}
                </>
              )}
              {popupEntries.length > 0 && (
                <>
                  <div className={styles.popupCaption} style={{ marginTop: popupEvts.length > 0 ? 10 : 0 }}>LOGGED</div>
                  {popupEntries.map(entry => (
                    <div key={entry.id} className={styles.popupEventRow}>
                      <span className={styles.popupTime}>{entry.time}</span>
                      <span className={styles.popupEventDot} style={{ background: entry.vectorColor }} />
                      <span className={styles.popupEventTitle}>{entry.description}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
