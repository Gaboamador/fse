import styles from './Header.module.scss';

const friendsLetters = ['F', 'R', 'I', 'E', 'N', 'D', 'S'];

const dotColors = [
  styles.dotRed,
  styles.dotBlue,
  styles.dotYellow,
  styles.dotRed,
  styles.dotYellow,
  styles.dotBlue,
];

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.title}>
          <div className={styles.friendsWord} aria-label="Friends">
            {friendsLetters.map((letter, index) => (
              <span key={`${letter}-${index}`} className={styles.friendUnit}>
                <span>{letter}</span>

                {index < dotColors.length && (
                  <span
                    className={`${styles.dot} ${dotColors[index]}`}
                    aria-hidden="true"
                  />
                )}
              </span>
            ))}
          </div>

          <div className={styles.searchEngine}>
            SEARCH ENGINE
          </div>
        </div>
      </div>
    </header>
  );
}