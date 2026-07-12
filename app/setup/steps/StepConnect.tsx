'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectGoogle } from '@/app/settings/actions';
import type { StepProps } from '../types';
import styles from '../setup.module.css';
import NavRow from '../NavRow';

type Props = StepProps & {
  googleConnected: boolean;
  googleHealthConnected: boolean;
};

export default function StepConnect({ onNext, onBack, googleConnected, googleHealthConnected }: Props) {
  const router = useRouter();
  const [disconnecting, startDisconnect] = useTransition();

  function handleDisconnect() {
    startDisconnect(async () => {
      await disconnectGoogle();
      router.refresh();
    });
  }

  const googleStatus = googleConnected && googleHealthConnected
    ? 'Calendar + Health connected'
    : googleConnected
    ? 'Calendar connected'
    : null;

  return (
    <div className={styles.stepPane}>
      <h2 className={styles.stepHeadline}>Connect your data.</h2>
      <p className={styles.stepSub}>
        lifeOS reads your sources so you don't have to report in manually.
        You can skip for now and connect later in Settings → Connections.
      </p>

      <div className={styles.connectionsList}>
        <div className={styles.connectionRow}>
          <div className={styles.connectionIcon} style={{ background: 'white', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.18 7.64v2.36h3.28c-.14.76-.54 1.4-1.15 1.84v1.53h1.86C14.27 12.3 15 10.8 15 9c0-.43-.04-.84-.11-1.36H9.18z" fill="#4285F4"/>
              <path d="M9.18 15c1.64 0 3.02-.54 4.02-1.47l-1.86-1.53c-.55.37-1.25.59-2.16.59-1.66 0-3.06-1.12-3.56-2.62H3.7v1.58A6.003 6.003 0 0 0 9.18 15z" fill="#34A853"/>
              <path d="M5.62 9.97c-.13-.38-.2-.78-.2-1.19 0-.41.07-.81.2-1.19V6.01H3.7A5.998 5.998 0 0 0 3 8.78c0 .96.23 1.87.7 2.77l1.92-1.58z" fill="#FBBC05"/>
              <path d="M9.18 5.16c.94 0 1.78.32 2.44.96l1.83-1.83C12.19 3.24 10.8 2.56 9.18 2.56A6.003 6.003 0 0 0 3.7 6.01l1.92 1.58c.5-1.5 1.9-2.43 3.56-2.43z" fill="#EA4335"/>
            </svg>
          </div>
          <div className={styles.connectionInfo}>
            <div className={styles.connectionName}>Google</div>
            <div className={styles.connectionMeta}>
              {googleStatus ? (
                <span className={styles.connectionStatusOn}>{googleStatus}</span>
              ) : (
                <span className={styles.connectionStatusOff}>Calendar &amp; Health · not connected</span>
              )}
            </div>
          </div>
          {googleConnected ? (
            <button
              className={styles.connectionBtnOutline}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              className={styles.connectionBtn}
              onClick={() => {
                localStorage.setItem('lifeos-setup-oauth', '1');
                window.location.href = '/api/auth/google?from=setup';
              }}
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <NavRow onBack={onBack} onNext={onNext} onSkip={onNext} skipLabel="Skip for now" />
    </div>
  );
}
