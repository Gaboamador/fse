import SearchResult from '../SearchResult.jsx';

export default function ResultsSection({ results, query, onOpenEpisode }) {
  const bestResult = results[0] ?? null;
  const alternatives = results.slice(1);

  if (!bestResult) return null;

  return (
    <section className="results-section">
      <div className="section-title">
        <h2>Mejor resultado</h2>
      </div>

      <SearchResult
        result={bestResult}
        query={query}
        primary
        onOpenEpisode={onOpenEpisode}
      />

      {alternatives.length > 0 && (
        <details className="alternative-results">
          <summary>¿Este no es el episodio que buscabas? Ver otras opciones</summary>

          <div className="alternative-list">
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
