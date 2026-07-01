import type { StepProps } from '../types';
import styles from '../setup.module.css';
import Segmented from '../Segmented';
import NavRow from '../NavRow';

export default function StepYou({ data, onChange, onNext, onBack }: StepProps) {
  return (
    <div className={styles.stepPane}>
      <h2 className={styles.stepHeadline}>Who are you?</h2>
      <p className={styles.stepSub}>
        Name and the units lifeOS speaks in — all adjustable later.
      </p>

      <div className={styles.fieldLabel}>Your name</div>
      <input
        className={styles.textInput}
        type="text"
        placeholder="Alex Rivera"
        value={data.name}
        onChange={e => onChange({ name: e.target.value })}
        autoComplete="off"
      />
      <div className={styles.fieldHint}>
        {data.timezone
          ? `Detected timezone · ${data.timezone}`
          : 'Detecting timezone…'}
      </div>

      <div className={styles.settingsList} style={{ marginTop: 22 }}>
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>Distance</span>
          <Segmented
            options={['km', 'mi']}
            value={data.distanceUnit}
            onChange={v => onChange({ distanceUnit: v as 'km' | 'mi' })}
          />
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>Currency</span>
          <div className={styles.selectInput}>
            <select
              value={data.currency}
              onChange={e => onChange({ currency: e.target.value })}
            >
              <option value="EUR">EUR · €</option>
              <option value="USD">USD · $</option>
              <option value="GBP">GBP · £</option>
              <option value="CHF">CHF · Fr</option>
              <option value="JPY">JPY · ¥</option>
            </select>
          </div>
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>Week starts on</span>
          <Segmented
            options={['Mon', 'Sun']}
            value={data.weekStart === 'mon' ? 'Mon' : 'Sun'}
            onChange={v => onChange({ weekStart: v === 'Mon' ? 'mon' : 'sun' })}
          />
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>Time format</span>
          <Segmented
            options={['24h', '12h']}
            value={data.timeFormat}
            onChange={v => onChange({ timeFormat: v as '24h' | '12h' })}
          />
        </div>
      </div>

      <NavRow onBack={onBack} onNext={data.name.trim() ? onNext : undefined} />
    </div>
  );
}
