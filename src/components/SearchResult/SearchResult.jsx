import styles from './SearchResult.module.scss';
import React from 'react';

import TranscriptText from '../TranscriptText';

export default function SearchResult({
  result,
  query,
  rank,
  primary = false,
  compact = false,
  onOpenEpisode,
}) {
  const s = result.best_scene;

  function openFullEpisode() {
    onOpenEpisode?.({
      episodeId: result.episode_id,
      sceneId: s.scene_id,
      query,
      source: 'search',
    });
  }

  return (
    <article className={`${styles.resultCard} ${primary ? styles.resultCardPrimary : ''} ${compact ? styles.resultCardCompact : ''}`}>
      {!primary && <div className={styles.resultRank}>#{rank}</div>}
      <div>
        <div className={styles.resultMeta}>
          <strong>{result.episode_id.toUpperCase()}</strong>
          <span>{result.title}</span>
        </div>
        {s.scene_heading && <div className={styles.sceneHeading}>{s.scene_heading}</div>}
        {Array.isArray(s.characters) && s.characters.length > 0 && (
          <div className={styles.characters}>{s.characters.join(' · ')}</div>
        )}
        <pre className={styles.preview}><TranscriptText transcript={s.preview} query={query} /></pre>

        <div className={styles.resultActions}>
          <button type="button" className={styles.secondaryButton} onClick={openFullEpisode}>
            Ver capítulo completo
          </button>
        </div>
      </div>
    </article>
  );
}
