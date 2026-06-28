'use client';

import { useState, useEffect } from 'react';
import styles from './today.module.css';

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function Clock({ timeFormat, timezone }: { timeFormat: '24h' | '12h'; timezone: string }) {
  const [time, setTime] = useState('');
  const [tz, setTz] = useState('');

  useEffect(() => {
    function tick() {
      const now = new Date();
      let h = now.getHours();
      const m = now.getMinutes();
      let display: string;
      if (timeFormat === '12h') {
        const ampm = h >= 12 ? 'pm' : 'am';
        h = h % 12 || 12;
        display = `${h}:${pad(m)} ${ampm}`;
      } else {
        display = `${pad(h)}:${pad(m)}`;
      }
      setTime(display);

      const offset = -now.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const oh = pad(Math.floor(Math.abs(offset) / 60));
      const om = pad(Math.abs(offset) % 60);
      const city = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone;
      setTz(`${city} · UTC${sign}${oh}:${om}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timeFormat, timezone]);

  return (
    <>
      <div className={styles.clockTime}>{time}</div>
      <div className={styles.clockTz}>{tz}</div>
    </>
  );
}
