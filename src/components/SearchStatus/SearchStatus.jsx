import styles from './SearchStatus.module.scss';
export default function SearchStatus({ ready, statusText, error }) {
  return (
    <>
      <div className={styles.statusLine}>
        <span className={`${styles.dot} ${ready ? styles.ok : ''}`} />
        {statusText}
      </div>

      {error && <div className={styles.error}>{error}</div>}
    </>
  );
}
