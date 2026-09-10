import { useEffect, useRef, useState } from 'react';

import TranscriptText from '../TranscriptText';
import { loadEpisode } from '../../data/friendsCorpus.js';

export default function EpisodeViewer({ request, onClose }) {
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [highlightedSceneId, setHighlightedSceneId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!request?.episodeId) {
      setEpisode(null);
      setError('');
      setLoading(false);
      setHighlightedSceneId(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setEpisode(null);
    setError('');
    setHighlightedSceneId(null);

    loadEpisode(request.episodeId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) throw new Error('No se encontró la transcripción completa de este episodio.');
        setEpisode(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        setEpisode(null);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    requestAnimationFrame(() => {
      viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      cancelled = true;
    };
  }, [request]);

  function jumpToMatch() {
    if (!request?.sceneId) return;

    const target = document.getElementById(
      `transcript-${request.episodeId}-${request.sceneId}`
    );

    if (!target) return;

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedSceneId(request.sceneId);

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedSceneId(null);
    }, 2000);
  }

  if (!request) return null;

  const episodeId = request.episodeId.toUpperCase();

  return (
    <section className="full-episode episode-viewer" ref={viewerRef}>
      <div className="full-episode-header">
        <div>
          <div className="full-episode-kicker">TRANSCRIPCIÓN COMPLETA</div>
          <h3>
            {episodeId}
            {episode?.canonical_title ? ` · ${episode.canonical_title}` : ''}
          </h3>
        </div>

        <div className="full-episode-actions">
          {request.sceneId && episode && (
            <button type="button" className="jump-to-match" onClick={jumpToMatch}>
              Ir al extracto encontrado
            </button>
          )}
          <button type="button" className="jump-to-match" onClick={onClose}>
            Cerrar capítulo
          </button>
        </div>
      </div>

      {loading && <div className="episode-viewer-status">Cargando capítulo…</div>}
      {error && <div className="episode-error episode-viewer-status">{error}</div>}

      {episode && !loading && !error && (
        <div className="full-transcript">
          {episode.scenes?.map((scene) => {
            const matched = scene.id === request.sceneId;
            const highlighted = scene.id === highlightedSceneId;

            return (
              <section
                key={scene.id}
                id={`transcript-${request.episodeId}-${scene.id}`}
                className={`transcript-scene ${matched ? 'transcript-scene-match' : ''} ${highlighted ? 'transcript-scene-highlight' : ''}`}
              >
                {scene.heading && <h4>{scene.heading}</h4>}
                <pre>
                  <TranscriptText transcript={scene.transcript} query={request.query ?? ''} />
                </pre>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
