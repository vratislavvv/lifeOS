'use client';

import { useState, useRef } from 'react';
import styles from './today.module.css';

const DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  return start;
}

function weekSubtitle(today: Date): string {
  const s = getWeekStart(today);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  if (s.getMonth() === e.getMonth())
    return `${MONTHS[s.getMonth()]} · week of ${s.getDate()}–${e.getDate()}`;
  return `${MON_SHORT[s.getMonth()]} ${s.getDate()} – ${MON_SHORT[e.getMonth()]} ${e.getDate()}`;
}

export default function CalSection({ weekStart }: { weekStart: 'mon' | 'sun' }) {
  const today = new Date();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [monthOffset, setMonthOffset] = useState(0);
  const calRef = useRef<HTMLDivElement>(null);

  // Build the 7 days of the current week
  const weekStartDate = getWeekStart(today);
  if (weekStart === 'sun') weekStartDate.setDate(weekStartDate.getDate() - 1);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    return d;
  });

  // Month grid
  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const gridStartOffset = firstDow === 0 ? -6 : 1 - firstDow;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const monthCells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i + gridStartOffset + 1;
    let d: Date;
    let isOther = false;
    if (dayNum < 1) { d = new Date(year, month - 1, prevDays + dayNum); isOther = true; }
    else if (dayNum > daysInMonth) { d = new Date(year, month + 1, dayNum - daysInMonth); isOther = true; }
    else d = new Date(year, month, dayNum);
    return { d, isOther };
  });

  const monthTitle = `${MONTHS[month]} ${year}`;

  return (
    <div className={styles.calSection} ref={calRef}>
      <div className={styles.calHeader}>
        <div className={styles.calTitleGroup}>
          <span className={styles.calTitle}>Calendar</span>
          <span className={styles.calSubtitle}>
            {view === 'week' ? weekSubtitle(today) : monthTitle}
          </span>
        </div>
        <div className={styles.calControls}>
          {view === 'month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className={styles.calNavBtn} onClick={() => setMonthOffset(o => o - 1)}>‹</button>
              <button type="button" className={styles.calNavBtn} onClick={() => setMonthOffset(o => o + 1)}>›</button>
            </div>
          )}
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => setView(v => v === 'week' ? 'month' : 'week')}
          >
            <span>{view === 'week' ? 'Expand to month' : 'Collapse to week'}</span>
            <span className={styles.toggleArrow}>{view === 'week' ? '⌄' : '⌃'}</span>
          </button>
        </div>
      </div>

      {view === 'week' && (
        <div className={styles.weekStrip}>
          {weekDays.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={i}
                className={[
                  styles.dayCell,
                  isToday ? styles.dayCellToday : '',
                  isWeekend ? styles.dayCellWeekend : '',
                ].join(' ')}
              >
                <span className={styles.dayDname}>{DAYS_SHORT[d.getDay()]}</span>
                <span className={styles.dayNum}>{d.getDate()}</span>
                <div className={styles.dayDots}>
                  <div className={styles.dayEmpty} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className={styles.monthGridWrap}>
          <div className={styles.weekdayHeader}>
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
              <div key={d} className={styles.wdLabel}>{d}</div>
            ))}
          </div>
          <div className={styles.monthGrid}>
            {monthCells.map(({ d, isOther }, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div
                  key={i}
                  className={[
                    styles.monthCell,
                    isOther ? styles.monthCellOther : '',
                    isToday ? styles.monthCellToday : '',
                  ].join(' ')}
                >
                  <span className={styles.monthNum}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
