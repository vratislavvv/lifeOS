import styles from './setup.module.css';

type Props = {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  onSkip?: () => void;
  skipLabel?: string;
};

export default function NavRow({ onBack, onNext, nextLabel = 'Continue', onSkip, skipLabel }: Props) {
  return (
    <div className={styles.navRow}>
      {onBack && (
        <button type="button" className={styles.btnBack} onClick={onBack}>
          Back
        </button>
      )}
      <div className={styles.navRight}>
        {onSkip && skipLabel && (
          <button type="button" className={styles.btnSkip} onClick={onSkip}>
            {skipLabel}
          </button>
        )}
        {onNext && (
          <button type="button" className={styles.btnPrimary} onClick={onNext}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
