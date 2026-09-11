import styles from './ResultsSection.module.scss';
import SearchResult from '../SearchResult';

export default function ResultsSection({ results, query, onOpenEpisode }) {
  const bestResult = results[0] ?? null;
  const alternatives = results.slice(1);

  if (!bestResult) return null;

  return (
    <section>
      <div className={styles.sectionTitle}>
        <h2>Mejor resultado</h2>
      </div>

      <SearchResult
        result={bestResult}
        query={query}
        primary
        onOpenEpisode={onOpenEpisode}
      />

      {alternatives.length > 0 && (
        <details className={styles.alternativeResults}>
          <summary>¿Este no es el episodio que buscabas? Ver otras opciones</summary>

          <div className={styles.alternativeList}>
            {alternatives.map((result, index) => (
              <SearchResult
                key={`${result.episode_id}-${index}`}
                result={result}
                query={query}
                rank={index + 2}
                compact
                onOpenEpisode={onOpenEpisode}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
