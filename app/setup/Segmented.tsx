import styles from './setup.module.css';

type Props = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
};

export default function Segmented({ options, value, onChange }: Props) {
  return (
    <div className={styles.segmented}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`${styles.segBtn} ${value === opt ? styles.segBtnActive : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
