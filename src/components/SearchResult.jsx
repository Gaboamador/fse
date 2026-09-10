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


function normalizeHighlightToken(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase();
}

function tokenSpans(value) {
  const text = String(value ?? '');
  const spans = [];
  const pattern = /[A-Za-z0-9]+(?:['’‘`][A-Za-z0-9]+)*/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    spans.push({
      token: normalizeHighlightToken(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return spans;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function findExactTokenRanges(sourceSpans, queryTokens) {
  if (sourceSpans.length < queryTokens.length) return [];

  const ranges = [];

  for (let i = 0; i <= sourceSpans.length - queryTokens.length; i++) {
    let matches = true;

    for (let j = 0; j < queryTokens.length; j++) {
      if (sourceSpans[i + j].token !== queryTokens[j]) {
        matches = false;
        break;
      }
    }

    if (!matches) continue;

    ranges.push({
      start: sourceSpans[i].start,
      end: sourceSpans[i + queryTokens.length - 1].end,
    });

    i += queryTokens.length - 1;
  }

  return ranges;
}

function findPartialTokenRanges(sourceSpans, queryTokens) {
  const candidates = [];

  // Only exact contiguous blocks of 2+ tokens qualify. Longer blocks win.
  for (let length = queryTokens.length - 1; length >= 2; length--) {
    for (let queryStart = 0; queryStart <= queryTokens.length - length; queryStart++) {
      const phraseTokens = queryTokens.slice(queryStart, queryStart + length);

      for (let sourceStart = 0; sourceStart <= sourceSpans.length - length; sourceStart++) {
        let matches = true;

        for (let offset = 0; offset < length; offset++) {
          if (sourceSpans[sourceStart + offset].token !== phraseTokens[offset]) {
            matches = false;
            break;
          }
        }

        if (!matches) continue;

        candidates.push({
          start: sourceSpans[sourceStart].start,
          end: sourceSpans[sourceStart + length - 1].end,
          queryStart,
          queryEnd: queryStart + length,
          length,
        });
      }
    }
  }

  const selected = [];
  const usedQueryRanges = [];

  for (const candidate of candidates) {
    const sourceConflict = selected.some((range) => rangesOverlap(candidate, range));
    const queryRange = { start: candidate.queryStart, end: candidate.queryEnd };
    const queryConflict = usedQueryRanges.some((range) => rangesOverlap(queryRange, range));

    if (sourceConflict || queryConflict) continue;

    selected.push(candidate);
    usedQueryRanges.push(queryRange);
  }

  return selected
    .map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start);
}

function highlightTranscriptText(text, query) {
  const source = String(text ?? '');
  const queryTokens = tokenSpans(query).map(({ token }) => token);
  if (!source || !queryTokens.length) return source;

  const spans = tokenSpans(source);
  if (!spans.length) return source;

  // Prefer the complete normalized phrase whenever it exists.
  let ranges = findExactTokenRanges(spans, queryTokens);

  // Otherwise highlight only exact contiguous fragments of at least 2 tokens.
  if (!ranges.length && queryTokens.length >= 2) {
    ranges = findPartialTokenRanges(spans, queryTokens);
  }

  if (!ranges.length) return source;

  const parts = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(source.slice(cursor, range.start));
    parts.push(
      <mark className="transcript-match-highlight" key={`match-${index}-${range.start}`}>
        {source.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });

  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

export default function SearchResult({ result, query, rank, primary = false, compact = false }) {
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
              {highlightTranscriptText(line, query)}
              {'\n'}
            </React.Fragment>
          );
        }

        const [, rawSpeaker, dialogue] = match;
        const canonicalSpeaker = resolveCanonicalSpeaker(rawSpeaker);

        if (!canonicalSpeaker) {
          return (
            <React.Fragment key={index}>
              {highlightTranscriptText(line, query)}
              {'\n'}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={index}>
            <span className="transcript-speaker">{canonicalSpeaker}:</span>
            {' '}
            {highlightTranscriptText(dialogue, query)}
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
