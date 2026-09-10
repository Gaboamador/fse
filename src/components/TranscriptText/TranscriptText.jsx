import React from 'react';

import { resolveCanonicalSpeaker } from '../../data/canonicalSpeakers';

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


export default function TranscriptText({ transcript, query = '' }) {
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
