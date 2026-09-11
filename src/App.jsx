import styles from './App.module.scss';
import { useEffect, useMemo, useRef, useState } from 'react';

import Header from './components/Header';
import EpisodeBrowser from './components/EpisodeBrowser';
import EpisodeViewer from './components/EpisodeViewer';
import ResultsSection from './components/ResultsSection';
import ScrollArrow from './components/ScrollArrow';
import SearchPanel from './components/SearchPanel';
import SearchStatus from './components/SearchStatus';
import { initializeSearch, searchFriends } from './search/searchClient.js';
import {
  clearSessionState,
  readSessionState,
  updateSessionScroll,
  writeSessionState,
} from './state/sessionState.js';

export default function App() {
  const initialSession = useMemo(() => readSessionState(), []);

  const [query, setQuery] = useState(initialSession?.query ?? '');
  const [results, setResults] = useState(initialSession?.results ?? []);
  const [searchedQuery, setSearchedQuery] = useState(initialSession?.searchedQuery ?? '');
  const [episodeRequest, setEpisodeRequest] = useState(initialSession?.episodeRequest ?? null);
  const [episodeHeaderContext, setEpisodeHeaderContext] = useState(null);
  const [pendingScrollRestore, setPendingScrollRestore] = useState(initialSession?.scroll ?? null);
  const [status, setStatus] = useState({ phase: 'idle', message: 'Sin inicializar' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollFrameRef = useRef(null);

  useEffect(() => {
    const onStatus = (event) => setStatus(event.detail);

    window.addEventListener('friends-search-status', onStatus);
    initializeSearch().catch((err) => setError(err.message));

    return () => window.removeEventListener('friends-search-status', onStatus);
  }, []);

  useEffect(() => {
    const hasPersistableState =
      Boolean(query) ||
      Boolean(searchedQuery) ||
      results.length > 0 ||
      Boolean(episodeRequest);

    if (!hasPersistableState) {
      clearSessionState();
      return;
    }

    const current = readSessionState();

    writeSessionState({
      query,
      searchedQuery,
      results,
      episodeRequest,
      scroll: current?.scroll ?? null,
    });
  }, [query, searchedQuery, results, episodeRequest]);

  useEffect(() => {
    function saveScrollNow() {
      const viewer = document.querySelector('[data-episode-viewer]');
      let episodeOffset = null;

      if (viewer) {
        const viewerTop = viewer.getBoundingClientRect().top + window.scrollY;
        episodeOffset = window.scrollY - viewerTop;
      }

      updateSessionScroll({
        pageY: window.scrollY,
        episodeOffset,
      });
    }

    function persistScrollPosition() {
      if (scrollFrameRef.current !== null) return;

      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        saveScrollNow();
      });
    }

    window.addEventListener('scroll', persistScrollPosition, { passive: true });
    window.addEventListener('pagehide', saveScrollNow);

    return () => {
      window.removeEventListener('scroll', persistScrollPosition);
      window.removeEventListener('pagehide', saveScrollNow);

      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingScrollRestore || episodeRequest) return;

    const frame = requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(0, pendingScrollRestore.pageY ?? 0),
        behavior: 'auto',
      });
      setPendingScrollRestore(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [pendingScrollRestore, episodeRequest]);

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
    setEpisodeRequest(null);
    setPendingScrollRestore(null);
    clearSessionState();
  }

  return (
    <>
      <Header episodeContext={episodeHeaderContext} />

      <main className={styles.shell}>
        <p className={styles.lede}>
          Buscá una escena por frase, recuerdo aproximado, descripción o título de episodio,
          en inglés, español o mezclando ambos. Si el primer resultado no es el que buscabas,
          podés revisar las otras opciones.
        </p>

        <div className={styles.contentLayout}>
          <div className={styles.searchStack}>
            <SearchPanel
              query={query}
              onQueryChange={setQuery}
              onSearch={runSearch}
              onClear={clearSearch}
              ready={ready}
              busy={busy}
              initialCollapsed={Boolean(
                initialSession?.searchedQuery &&
                initialSession?.query?.trim() === initialSession.searchedQuery
              )}
            />

            <SearchStatus ready={ready} statusText={statusText} error={error} />
          </div>

          <EpisodeBrowser
            activeEpisodeId={episodeRequest?.episodeId ?? null}
            onOpenEpisode={setEpisodeRequest}
          />

          <div className={styles.contentStack}>
            <ResultsSection
              results={results}
              query={searchedQuery}
              onOpenEpisode={setEpisodeRequest}
            />
            <EpisodeViewer
              request={episodeRequest}
              onClose={() => setEpisodeRequest(null)}
              onHeaderContextChange={setEpisodeHeaderContext}
              restoreScroll={pendingScrollRestore}
              onScrollRestored={() => setPendingScrollRestore(null)}
            />
          </div>
        </div>
        <ScrollArrow />
      </main>
    </>
  );
}
