import { useEffect, useMemo, useState } from 'react';

import Header from './components/Header';
import ResultsSection from './components/ResultsSection';
import ScrollArrow from './components/ScrollArrow';
import SearchPanel from './components/SearchPanel';
import SearchStatus from './components/SearchStatus';
import { initializeSearch, searchFriends } from './search/searchClient.js';

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchedQuery, setSearchedQuery] = useState('');
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

  async function runSearch(event) {
    event?.preventDefault();

    const normalizedQuery = query.trim();
    if (!normalizedQuery || busy) return;

    setBusy(true);
    setError('');
    setResults([]);

    try {
      const out = await searchFriends(normalizedQuery, { includeShort: true, limit: 10 });
      setResults(out.combined ?? out.long10 ?? []);
      setSearchedQuery(normalizedQuery);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setSearchedQuery('');
    setError('');
  }

  return (
    <>
      <Header />
      
      <main className="shell">
        <p className="lede">
          Buscá una escena por frase, recuerdo aproximado o descripción en inglés,
          español o mezclando ambos. Si el primer resultado no es el que buscabas,
          podés revisar las otras opciones.
        </p>

        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          onSearch={runSearch}
          onClear={clearSearch}
          ready={ready}
          busy={busy}
        />

        <SearchStatus ready={ready} statusText={statusText} error={error} />
        <ResultsSection results={results} query={searchedQuery} />
        <ScrollArrow />
      </main>
    </>
  );
}
