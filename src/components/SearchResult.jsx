import React from 'react';

import TranscriptText from './TranscriptText';

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
    <article className={`result-card ${primary ? 'result-card-primary' : ''} ${compact ? 'result-card-compact' : ''}`}>
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
        <pre className="preview"><TranscriptText transcript={s.preview} query={query} /></pre>

        <div className="result-actions">
          <button type="button" className="secondary-button" onClick={openFullEpisode}>
            Ver capítulo completo
          </button>
        </div>
      </div>
    </article>
  );
}
