import styles from './EpisodeBrowser.module.scss';
import { useMemo, useState } from 'react';

import { loadCorpus } from '../../data/friendsCorpus.js';

function episodeLabel(episode) {
  const season = String(episode.season).padStart(2, '0');
  const number = String(episode.episode_number).padStart(2, '0');
  return `S${season}E${number}`;
}

export default function EpisodeBrowser({ activeEpisodeId = null, onOpenEpisode }) {
  const [open, setOpen] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const seasons = useMemo(() => {
    const grouped = new Map();
    for (const episode of episodes) {
      const season = Number(episode.season);
      if (!grouped.has(season)) grouped.set(season, []);
      grouped.get(season).push(episode);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [episodes]);

  async function toggleBrowser() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || episodes.length > 0 || loading) return;

    setLoading(true);
    setError('');
    try {
      const corpus = await loadCorpus();
      setEpisodes(corpus.episodes ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function selectEpisode(episode) {
    onOpenEpisode?.({
      episodeId: episode.id,
      sceneId: null,
      query: '',
      source: 'browser',
    });
  }

  return (
    <aside className={styles.episodeBrowser} aria-label="Explorar episodios">
      <button
        type="button"
        className={`${styles.episodeBrowserToggle} ${open ? styles.episodeBrowserToggleActive : ''}`}
        onClick={toggleBrowser}
      >
        {open ? 'Ocultar episodios' : 'Explorar temporadas y episodios'}
      </button>

      {open && (
        <div className={styles.episodeBrowserPanel}>
          {loading && <div className={styles.episodeBrowserStatus}>Cargando episodios…</div>}
          {error && <div className={styles.episodeError}>{error}</div>}

          {!loading && !error && seasons.length > 0 && (
            <div className={styles.seasonList}>
              {seasons.map(([season, seasonEpisodes]) => (
                <details className={styles.seasonGroup} key={season}>
                  <summary>
                    Temporada {season}
                    <span>{seasonEpisodes.length} episodios</span>
                  </summary>
                  <div className={styles.episodeList}>
                    {seasonEpisodes.map((episode) => (
                      <button
                        type="button"
                        className={`${styles.episodeListItem} ${activeEpisodeId === episode.id ? styles.episodeListItemActive : ''}`}
                        key={episode.id}
                        onClick={() => selectEpisode(episode)}
                      >
                        <strong>{episodeLabel(episode)}</strong>
                        <span>{episode.canonical_title}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
