import React, { useEffect, useMemo, useState } from 'react';
import SearchResult from './components/SearchResult.jsx';
import { initializeSearch, searchFriends } from './search/searchClient.js';
import ScrollArrow from './components/ScrollArrow/ScrollArrow.jsx';

const EXAMPLES = [
  'Rachel se golpea la cabeza contra una pared y dice algo de que si no es un board algo no es worth it',
  'Ross usa pantalones de cuero y después no puede volver a ponérselos',
  'pivot couch stairs',
  'Phoebe dice que le gustaría ayudar a armar muebles pero en realidad no quiere',
];

export default function App() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ phase: 'idle', message: 'Sin inicializar' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onStatus = (event) => setStatus(event.detail);
    window.addEventListener('friends-search-status', onStatus);
    initializeSearch().catch((err) => setError(err.message));
    return () => window.removeEventListener('friends-search-status', onStatus);
  }, []);

  const ready = status.phase === 'ready' || status.phase === 'searching';
  const statusText = useMemo(() => status.message ?? status.phase, [status]);
  const bestResult = results[0] ?? null;
  const alternatives = results.slice(1);

  async function runSearch(event) {
    event?.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError('');
    setResults([]);
    try {
      const out = await searchFriends(query.trim(), { includeShort: true, limit: 10 });
      setResults(out.combined ?? out.long10 ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleTextareaKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      runSearch(event);
    }
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setError('');
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">LOCAL · E5 MULTILINGUAL · SIN API</p>
        <h1>FSE</h1>
        <p className="lede">Buscá una escena por frase, recuerdo aproximado o descripción en español, inglés o mezclando ambos.</p>
      </header>

      <form onSubmit={runSearch} className="search-panel">
        <div className="textarea-wrap">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={3}
            spellCheck="false"
          />
          {query && (
            <button type="button" className="clear-search" onClick={clearSearch} aria-label="Limpiar búsqueda" title="Limpiar búsqueda">
              ×
            </button>
          )}
        </div>
        <div className="controls">
          <button type="submit" disabled={!ready || busy || !query.trim()}>{busy ? 'Buscando…' : 'Buscar'}</button>
          <span className="enter-hint">Enter para buscar · Shift+Enter para nueva línea</span>
        </div>
      </form>

      <div className="status-line"><span className={`dot ${ready ? 'ok' : ''}`} /> {statusText}</div>
      {error && <div className="error">{error}</div>}

      <div className="examples">
        {EXAMPLES.map((item) => <button key={item} type="button" onClick={() => setQuery(item)}>{item}</button>)}
      </div>

      {bestResult && (
        <section className="results-section">
          <div className="section-title"><h2>Mejor resultado</h2></div>
          <SearchResult result={bestResult} primary />

          {alternatives.length > 0 && (
            <details className="alternative-results">
              <summary>¿Este no es el episodio que buscabas? Ver otras opciones</summary>
              <div className="alternative-list">
                {alternatives.map((result, index) => (
                  <SearchResult
                    key={`${result.episode_id}-${index}`}
                    result={result}
                    rank={index + 2}
                    compact
                  />
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      <ScrollArrow />
    </main>
  );
}
