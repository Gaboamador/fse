import React, { useEffect, useRef, useState } from 'react';

import { resolveCanonicalSpeaker } from '../data/canonicalSpeakers';

let corpusPromise;

async function loadCorpus() {
  if (!corpusPromise) {
    corpusPromise = fetch(`${import.meta.env.BASE_URL}data/friends-corpus.json`).then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar el capítulo: HTTP ${response.status}`);
      return response.json();
    });
  }
  return corpusPromise;
}

async function loadEpisode(episodeId) {
  const corpus = await loadCorpus();
  return corpus.episodes?.find((episode) => episode.id === episodeId) ?? null;
}

export default function SearchResult({ result, rank, primary = false, compact = false }) {
  const s = result.best_scene;
  const [episode, setEpisode] = useState(null);
  const [showFullEpisode, setShowFullEpisode] = useState(false);
  const [loadingEpisode, setLoadingEpisode] = useState(false);
  const [episodeError, setEpisodeError] = useState('');
  const [highlightedSceneId, setHighlightedSceneId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const fullEpisodeRef = useRef(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  async function toggleFullEpisode() {
    if (showFullEpisode) {
      setShowFullEpisode(false);
      return;
    }

    if (!episode) {
      setLoadingEpisode(true);
      setEpisodeError('');
      try {
        const loaded = await loadEpisode(result.episode_id);
        if (!loaded) throw new Error('No se encontró la transcripción completa de este episodio.');
        setEpisode(loaded);
      } catch (error) {
        setEpisodeError(error.message);
        return;
      } finally {
        setLoadingEpisode(false);
      }
    }

    setShowFullEpisode(true);
  }

  function jumpToMatch() {
    const target = document.getElementById(
      `transcript-${result.episode_id}-${s.scene_id}`
    );

    if (!target) return;

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedSceneId(s.scene_id);

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedSceneId(null);
    }, 2000);
  }

  function renderTranscript(transcript) {
    return String(transcript ?? '')
      .split('\n')
      .map((line, index) => {
        const match = line.match(/^([^:]+):\s*(.*)$/);

        if (!match) {
          return (
            <React.Fragment key={index}>
              {line}
              {'\n'}
            </React.Fragment>
          );
        }

        const [, rawSpeaker, dialogue] = match;
        const canonicalSpeaker = resolveCanonicalSpeaker(rawSpeaker);

        if (!canonicalSpeaker) {
          return (
            <React.Fragment key={index}>
              {line}
              {'\n'}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={index}>
            <span className="transcript-speaker">{canonicalSpeaker}:</span>
            {' '}
            {dialogue}
            {'\n'}
          </React.Fragment>
        );
      });
  }

  return (
    <article className={`result-card ${primary ? 'result-card-primary' : ''} ${compact ? 'result-card-compact' : ''} ${showFullEpisode ? 'result-card-expanded' : ''}`}>
      {!primary && <div className="result-rank">#{rank}</div>}
      <div className="result-main">
        <div className="result-meta">
          <strong>{result.episode_id.toUpperCase()}</strong>
          <span>{result.title}</span>
        </div>
        {s.scene_heading && <div className="scene-heading">{s.scene_heading}</div>}
        {Array.isArray(s.characters) && s.characters.length > 0 && (
          <div className="characters">{s.characters.join(' · ')}</div>
        )}
        <pre className="preview">{renderTranscript(s.preview)}</pre>

        <div className="result-actions">
          <button type="button" className="secondary-button" onClick={toggleFullEpisode} disabled={loadingEpisode}>
            {loadingEpisode ? 'Cargando capítulo…' : showFullEpisode ? 'Ocultar capítulo completo' : 'Ver capítulo completo'}
          </button>
        </div>

        {episodeError && <div className="episode-error">{episodeError}</div>}

        {showFullEpisode && episode && (
          <div className="full-episode" ref={fullEpisodeRef}>
            <div className="full-episode-header">
              <div>
                <div className="full-episode-kicker">TRANSCRIPCIÓN COMPLETA</div>
                <h3>{result.episode_id.toUpperCase()} · {episode.canonical_title ?? result.title}</h3>
              </div>
              <button type="button" className="jump-to-match" onClick={jumpToMatch}>Ir al extracto encontrado</button>
            </div>

            <div className="full-transcript">
              {episode.scenes?.map((scene) => {
                const matched = scene.id === s.scene_id;
                const highlighted = scene.id === highlightedSceneId;
                return (
                  <section
                    key={scene.id}
                    id={`transcript-${result.episode_id}-${scene.id}`}
                    className={`transcript-scene ${matched ? 'transcript-scene-match' : ''} ${highlighted ? 'transcript-scene-highlight' : ''}`}
                  >
                    {scene.heading && <h4>{scene.heading}</h4>}
                    <pre>{renderTranscript(scene.transcript)}</pre>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
