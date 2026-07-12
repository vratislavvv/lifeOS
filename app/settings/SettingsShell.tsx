'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveSettings, disconnectGoogle } from './actions';
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

const CURRENCIES = [
  { code: 'EUR', label: 'EUR · €' },
  { code: 'USD', label: 'USD · $' },
  { code: 'GBP', label: 'GBP · £' },
  { code: 'CHF', label: 'CHF · Fr' },
  { code: 'CZK', label: 'CZK · Kč' },
  { code: 'PLN', label: 'PLN · zł' },
  { code: 'JPY', label: 'JPY · ¥' },
  { code: 'CAD', label: 'CAD · $' },
  { code: 'AUD', label: 'AUD · $' },
];

const SECTIONS = [
  { key: 'profile',    label: 'Profile' },
  { key: 'lenna',      label: 'Lenna' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'connections', label: 'Connections' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.seg}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`${styles.segOpt} ${value === o.value ? styles.segOptActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PrefRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className={styles.prefRow}>
      <div className={styles.prefLabelWrap}>
        <span className={styles.prefLabel}>{label}</span>
        {sub && <span className={styles.prefSub}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsShell({ user }: { user: User }) {
  const [section, setSection] = useState<SectionKey>('profile');

  const [name,          setName]          = useState(user.name);
  const [timezone,      setTimezone]      = useState(user.timezone);
  const [weekStart,     setWeekStart]     = useState<'mon' | 'sun'>(user.weekStart);
  const [timeFormat,    setTimeFormat]    = useState<'24h' | '12h'>(user.timeFormat);
  const [distanceUnit,  setDistanceUnit]  = useState<'km' | 'mi'>(user.distanceUnit);
  const [currency,      setCurrency]      = useState(user.currency);

  const [lennaTone,     setLennaTone]     = useState<'warm' | 'neutral' | 'direct'>(user.lennaTone);
  const [lennaAutonomy, setLennaAutonomy] = useState<'suggest' | 'draft' | 'act'>(user.lennaAutonomy);
  const [darkMode,      setDarkMode]      = useState(user.darkMode);

  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [pending,    startTransition]    = useTransition();
  const [disconnecting, startDisconnect] = useTransition();


  function handleSave() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('name',          name.trim());
    fd.set('timezone',      timezone);
    fd.set('weekStart',     weekStart);
    fd.set('timeFormat',    timeFormat);
    fd.set('distanceUnit',  distanceUnit);
    fd.set('currency',      currency);
    fd.set('lennaTone',     lennaTone);
    fd.set('lennaAutonomy', lennaAutonomy);
    fd.set('darkMode',      String(darkMode));
    startTransition(async () => {
      const result = await saveSettings(fd);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  function switchSection(key: SectionKey) {
    setSection(key);
    setSaved(false);
    setError(null);
  }

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={styles.shell}>

      {/* ── Nav sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}><Link href="/today"   className={styles.navLink}>Dashboard</Link></div>
            <div className={styles.navItem}><Link href="/quarter" className={styles.navLink}>Trajectory</Link></div>
            <div className={styles.navItem}><Link href="/tasks"   className={styles.navLink}>Tasks</Link></div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <div className={`${styles.sidebarFooterLink} ${styles.sidebarFooterLinkActive}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </div>
        </div>
      </aside>

      {/* ── Settings rail ── */}
      <nav className={styles.rail}>
        <div className={styles.railCaption}>SETTINGS</div>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`${styles.railItem} ${section === s.key ? styles.railItemActive : ''}`}
            onClick={() => switchSection(s.key)}
          >
            {s.label}
          </button>
        ))}
        <div className={styles.railSpacer} />
        <div className={styles.railFooter}>lifeOS</div>
      </nav>

      {/* ── Content pane ── */}
      <div className={styles.content}>

        {/* ── Profile ── */}
        {section === 'profile' && (
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Profile</div>
              <div className={styles.sectionSubtitle}>Who you are in lifeOS, and the units it counts in. These shape how your vectors and stats read.</div>
            </div>

            {/* Identity card */}
            <div className={styles.identityCard}>
              <label className={styles.identityFieldLabel}>Display name</label>
              <input
                className={styles.identityNameInput}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            {/* Preferences */}
            <div className={styles.prefSection}>
              <div className={styles.groupCaption}>PREFERENCES</div>
              <div className={styles.prefGroup}>
                <PrefRow label="Time zone">
                  <select
                    className={styles.selectChip}
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                  >
                    {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </PrefRow>
                <PrefRow label="Week starts on">
                  <Seg
                    options={[{ value: 'mon', label: 'Mon' }, { value: 'sun', label: 'Sun' }]}
                    value={weekStart}
                    onChange={setWeekStart}
                  />
                </PrefRow>
                <PrefRow label="Time format">
                  <Seg
                    options={[{ value: '24h', label: '24h' }, { value: '12h', label: '12h' }]}
                    value={timeFormat}
                    onChange={setTimeFormat}
                  />
                </PrefRow>
              </div>
            </div>

            {/* Units */}
            <div className={styles.prefSection}>
              <div className={styles.groupCaption}>UNITS</div>
              <div className={styles.prefGroup}>
                <PrefRow label="Distance" sub="How the Body vector and Running stats read">
                  <Seg
                    options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]}
                    value={distanceUnit}
                    onChange={setDistanceUnit}
                  />
                </PrefRow>
                <PrefRow label="Currency" sub="How the Money vector and Net Worth read">
                  <select
                    className={styles.selectChip}
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                  >
                    {!CURRENCIES.find(c => c.code === currency) && <option value={currency}>{currency}</option>}
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </PrefRow>
              </div>
            </div>

            {memberSince && (
              <div className={styles.sectionFooter}>Member since {memberSince}</div>
            )}

            <div className={styles.saveRow}>
              {error  && <span className={styles.saveError}>{error}</span>}
              {saved  && <span className={styles.saveDone}>Saved.</span>}
              <button className={styles.saveBtn} onClick={handleSave} disabled={pending}>
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Lenna ── */}
        {section === 'lenna' && (
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Lenna</div>
              <div className={styles.sectionSubtitle}>How Lenna speaks and acts. These shape her tone and how much she does on your behalf.</div>
            </div>

            <div className={styles.prefSection}>
              <div className={styles.groupCaption}>PERSONALITY</div>
              <div className={styles.prefGroup}>
                <PrefRow label="Tone">
                  <Seg
                    options={[
                      { value: 'warm',    label: 'Warm' },
                      { value: 'neutral', label: 'Neutral' },
                      { value: 'direct',  label: 'Direct' },
                    ]}
                    value={lennaTone}
                    onChange={setLennaTone}
                  />
                </PrefRow>
                <PrefRow label="Autonomy" sub="How much Lenna does without asking">
                  <Seg
                    options={[
                      { value: 'suggest', label: 'Suggest' },
                      { value: 'draft',   label: 'Draft' },
                      { value: 'act',     label: 'Act' },
                    ]}
                    value={lennaAutonomy}
                    onChange={setLennaAutonomy}
                  />
                </PrefRow>
              </div>
            </div>

            <div className={styles.saveRow}>
              {error  && <span className={styles.saveError}>{error}</span>}
              {saved  && <span className={styles.saveDone}>Saved.</span>}
              <button className={styles.saveBtn} onClick={handleSave} disabled={pending}>
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Appearance ── */}
        {section === 'appearance' && (
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Appearance</div>
              <div className={styles.sectionSubtitle}>Choose how lifeOS looks on this device.</div>
            </div>

            <div className={styles.prefSection}>
              <div className={styles.groupCaption}>THEME</div>
              <div className={styles.prefGroup}>
                <PrefRow label="Color scheme">
                  <Seg
                    options={[{ value: 'false', label: 'Light' }, { value: 'true', label: 'Dark' }]}
                    value={String(darkMode) as 'true' | 'false'}
                    onChange={v => setDarkMode(v === 'true')}
                  />
                </PrefRow>
              </div>
            </div>

            <div className={styles.saveRow}>
              {error  && <span className={styles.saveError}>{error}</span>}
              {saved  && <span className={styles.saveDone}>Saved.</span>}
              <button className={styles.saveBtn} onClick={handleSave} disabled={pending}>
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Connections ── */}
        {section === 'connections' && (
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Connections</div>
              <div className={styles.sectionSubtitle}>Link external services so lifeOS can read your data automatically.</div>
            </div>

            <div className={styles.prefSection}>
              <div className={styles.groupCaption}>GOOGLE</div>
              <div className={styles.prefGroup}>
                <div className={styles.connRow}>
                  <div className={styles.connInfo}>
                    <span className={styles.connName}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                        <rect width="18" height="18" rx="4" fill="white" stroke="#E0E0E0" strokeWidth="0.75"/>
                        <path d="M9.18 7.64v2.36h3.28c-.14.76-.54 1.4-1.15 1.84v1.53h1.86C14.27 12.3 15 10.8 15 9c0-.43-.04-.84-.11-1.36H9.18z" fill="#4285F4"/>
                        <path d="M9.18 15c1.64 0 3.02-.54 4.02-1.47l-1.86-1.53c-.55.37-1.25.59-2.16.59-1.66 0-3.06-1.12-3.56-2.62H3.7v1.58A6.003 6.003 0 0 0 9.18 15z" fill="#34A853"/>
                        <path d="M5.62 9.97c-.13-.38-.2-.78-.2-1.19 0-.41.07-.81.2-1.19V6.01H3.7A5.998 5.998 0 0 0 3 8.78c0 .96.23 1.87.7 2.77l1.92-1.58z" fill="#FBBC05"/>
                        <path d="M9.18 5.16c.94 0 1.78.32 2.44.96l1.83-1.83C12.19 3.24 10.8 2.56 9.18 2.56A6.003 6.003 0 0 0 3.7 6.01l1.92 1.58c.5-1.5 1.9-2.43 3.56-2.43z" fill="#EA4335"/>
                      </svg>
                      Google
                    </span>
                    {user.googleRefreshToken ? (
                      <span className={styles.connStatusOn}>Connected · Calendar + Health</span>
                    ) : (
                      <span className={styles.connStatusOff}>Not connected</span>
                    )}
                  </div>
                  {user.googleRefreshToken ? (
                    <button
                      className={styles.connBtnOutline}
                      onClick={() => startDisconnect(() => disconnectGoogle())}
                      disabled={disconnecting}
                    >
                      {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button className={styles.connBtn} onClick={() => { window.location.href = '/api/auth/google'; }}>Connect</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
