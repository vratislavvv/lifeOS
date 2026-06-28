import type { StepProps } from '../types';
import { VECTORS } from '@/lib/vectors';
import styles from '../setup.module.css';
import Segmented from '../Segmented';
import NavRow from '../NavRow';

export default function StepLenna({ data, onChange, onNext, onBack }: StepProps) {
  const first = data.name.trim().split(' ')[0] || 'you';
  const focuses = data.vectors.slice(0, 2).map(k => VECTORS[k].label);
  const focus =
    focuses.length > 1
      ? `${focuses[0]} and ${focuses[1]}`
      : focuses[0] ?? 'your vectors';

  return (
    <div className={styles.stepPane}>
      <div className={styles.lennaAvatar}>
        <div className={styles.lennaMark}>L</div>
        <h2 className={styles.stepHeadline} style={{ marginBottom: 0 }}>
          Meet Lenna.
        </h2>
      </div>

      <div className={styles.lennaIntro}>
        Hi {first} — I'll keep {focus} honest this quarter, draft your days,
        and protect your mornings. Tell me how to show up.
      </div>

      <div className={styles.settingsList}>
        <div className={styles.settingsRow}>
          <span className={styles.settingsRowLabel}>Tone</span>
          <Segmented
            options={['Warm', 'Neutral', 'Direct']}
            value={data.lennaTone === 'warm' ? 'Warm' : data.lennaTone === 'neutral' ? 'Neutral' : 'Direct'}
            onChange={v =>
              onChange({ lennaTone: v.toLowerCase() as 'warm' | 'neutral' | 'direct' })
            }
          />
        </div>
        <div className={styles.settingsRow}>
          <div>
            <div className={styles.settingsRowLabel}>Autonomy</div>
            <div className={styles.settingsRowSub}>How far she goes before asking you</div>
          </div>
          <Segmented
            options={['Suggest', 'Draft & ask', 'Act']}
            value={
              data.lennaAutonomy === 'suggest'
                ? 'Suggest'
                : data.lennaAutonomy === 'draft'
                ? 'Draft & ask'
                : 'Act'
            }
            onChange={v =>
              onChange({
                lennaAutonomy:
                  v === 'Suggest' ? 'suggest' : v === 'Draft & ask' ? 'draft' : 'act',
              })
            }
          />
        </div>
      </div>

      <NavRow onBack={onBack} onNext={onNext} />
    </div>
  );
}
