import styles from './EpisodeViewer.module.scss';
import { useEffect, useRef, useState } from 'react';

import TranscriptText from '../TranscriptText';
import { loadEpisode } from '../../data/friendsCorpus.js';

export default function EpisodeViewer({
  request,
  onClose,
  onHeaderContextChange,
  restoreScroll = null,
  onScrollRestored,
}) {
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [highlightedSceneId, setHighlightedSceneId] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const viewerRef = useRef(null);
  const headerContextActiveRef = useRef(false);
  const restoredEpisodeRef = useRef(null);

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
      restoredEpisodeRef.current = null;
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

    if (!restoreScroll) {
      requestAnimationFrame(() => {
        viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!episode || !request?.episodeId || !restoreScroll) return;
    if (restoredEpisodeRef.current === request.episodeId) return;

    let secondFrame = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const viewerTop = viewer.getBoundingClientRect().top + window.scrollY;
        const hasEpisodeOffset = Number.isFinite(restoreScroll.episodeOffset);
        const targetY = hasEpisodeOffset
          ? viewerTop + restoreScroll.episodeOffset
          : restoreScroll.pageY ?? viewerTop;

        window.scrollTo({
          top: Math.max(0, targetY),
          behavior: 'auto',
        });

        restoredEpisodeRef.current = request.episodeId;
        onScrollRestored?.();
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [episode, request?.episodeId, restoreScroll, onScrollRestored]);

  useEffect(() => {
    if (!request?.episodeId || !episode) {
      headerContextActiveRef.current = false;
      onHeaderContextChange?.(null);
      return;
    }

    let animationFrame = null;

    function updateHeaderContext() {
      if (animationFrame !== null) return;

      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;

        const viewer = viewerRef.current;
        if (!viewer) return;

        const header = document.querySelector('header');
        const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
        const viewerRect = viewer.getBoundingClientRect();
        const active = viewerRect.top <= headerBottom && viewerRect.bottom > headerBottom;

        if (active === headerContextActiveRef.current) return;

        headerContextActiveRef.current = active;
        onHeaderContextChange?.(
          active
            ? {
                episodeId: request.episodeId.toUpperCase(),
                title: episode.canonical_title ?? '',
              }
            : null
        );
      });
    }

    updateHeaderContext();
    window.addEventListener('scroll', updateHeaderContext, { passive: true });
    window.addEventListener('resize', updateHeaderContext);

    return () => {
      window.removeEventListener('scroll', updateHeaderContext);
      window.removeEventListener('resize', updateHeaderContext);

      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }

      headerContextActiveRef.current = false;
      onHeaderContextChange?.(null);
    };
  }, [episode, request?.episodeId, onHeaderContextChange]);

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
    <section
      className={`${styles.fullEpisode} ${styles.episodeViewer}`}
      ref={viewerRef}
      data-episode-viewer
    >
      <div className={styles.fullEpisodeHeader}>
        <div>
          <div className={styles.fullEpisodeKicker}>TRANSCRIPCIÓN COMPLETA</div>
          <h3>
            {episodeId}
            {episode?.canonical_title ? ` · ${episode.canonical_title}` : ''}
          </h3>
        </div>

        <div className={styles.fullEpisodeActions}>
          {request.sceneId && episode && (
            <button type="button" className={styles.jumpToMatch} onClick={jumpToMatch}>
              Ir al extracto encontrado
            </button>
          )}
          <button type="button" className={styles.jumpToMatch} onClick={onClose}>
            Cerrar capítulo
          </button>
        </div>
      </div>

      {loading && <div className={styles.episodeViewerStatus}>Cargando capítulo…</div>}
      {error && <div className={`${styles.episodeError} ${styles.episodeViewerStatus}`}>{error}</div>}

      {episode && !loading && !error && (
        <div className={styles.fullTranscript}>
          {episode.scenes?.map((scene) => {
            const matched = scene.id === request.sceneId;
            const highlighted = scene.id === highlightedSceneId;

            return (
              <section
                key={scene.id}
                id={`transcript-${request.episodeId}-${scene.id}`}
                className={`${styles.transcriptScene} ${matched ? styles.transcriptSceneMatch : ''} ${highlighted ? styles.transcriptSceneHighlight : ''}`}
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
