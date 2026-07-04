'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveSettings } from './actions';
import type { user } from '@/lib/db/schema';
import styles from './settings.module.css';

type User = typeof user.$inferSelect;

const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Prague',
  'Europe/Warsaw', 'Europe/Rome', 'Europe/Madrid', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland',
];

export default function SettingsShell({ user }: { user: User }) {
  const [name,       setName]       = useState(user.name);
  const [timezone,   setTimezone]   = useState(user.timezone);
  const [weekStart,  setWeekStart]  = useState(user.weekStart);
  const [timeFormat, setTimeFormat] = useState(user.timeFormat);
  const [lennaTone,  setLennaTone]  = useState(user.lennaTone);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [pending,    startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('name',       name);
    fd.set('timezone',   timezone);
    fd.set('weekStart',  weekStart);
    fd.set('timeFormat', timeFormat);
    fd.set('lennaTone',  lennaTone);
    startTransition(async () => {
      const result = await saveSettings(fd);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className={styles.shell}>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}><Link href="/today"   className={styles.navLink}>Today</Link></div>
            <div className={styles.navItem}><Link href="/quarter" className={styles.navLink}>Quarter</Link></div>
            <div className={styles.navItem}><Link href="/tasks"   className={styles.navLink}>Tasks</Link></div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <div className={`${styles.sidebarFooterLink} ${styles.sidebarFooterLinkActive}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75, marginRight: 7 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </div>
        </div>
      </aside>

      <div className={styles.center}>
        <div className={styles.centerHeader}>
          <div className={styles.centerTitle}>Settings</div>
        </div>

        <div className={styles.centerBody}>
          <form onSubmit={handleSubmit} className={styles.form}>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Profile</div>
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input
                  className={styles.input}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Timezone</label>
                <select className={styles.select} value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONES.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Display</div>
              <div className={styles.field}>
                <label className={styles.label}>Week starts on</label>
                <div className={styles.toggle}>
                  {(['mon', 'sun'] as const).map(w => (
                    <button key={w} type="button"
                      className={`${styles.toggleBtn} ${weekStart === w ? styles.toggleBtnActive : ''}`}
                      onClick={() => setWeekStart(w)}
                    >
                      {w === 'mon' ? 'Monday' : 'Sunday'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Time format</label>
                <div className={styles.toggle}>
                  {(['24h', '12h'] as const).map(f => (
                    <button key={f} type="button"
                      className={`${styles.toggleBtn} ${timeFormat === f ? styles.toggleBtnActive : ''}`}
                      onClick={() => setTimeFormat(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Lenna</div>
              <div className={styles.field}>
                <label className={styles.label}>Tone</label>
                <div className={styles.toggle}>
                  {(['warm', 'neutral', 'direct'] as const).map(t => (
                    <button key={t} type="button"
                      className={`${styles.toggleBtn} ${lennaTone === t ? styles.toggleBtnActive : ''}`}
                      onClick={() => setLennaTone(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className={styles.fieldHint}>
                  {lennaTone === 'warm'    && 'Encouraging, personal, uses your name often.'}
                  {lennaTone === 'neutral' && 'Balanced — informative without being clinical.'}
                  {lennaTone === 'direct'  && 'Concise and to the point. Minimal filler.'}
                </div>
              </div>
            </div>

            <div className={styles.formFooter}>
              {error  && <div className={styles.formError}>{error}</div>}
              {saved  && <div className={styles.formSaved}>Saved.</div>}
              <button type="submit" className={styles.saveBtn} disabled={pending}>
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>

          </form>
        </div>
      </div>

    </div>
  );
}
