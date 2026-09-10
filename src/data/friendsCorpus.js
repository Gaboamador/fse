let corpusPromise;

export async function loadCorpus() {
  if (!corpusPromise) {
    corpusPromise = fetch(`${import.meta.env.BASE_URL}data/friends-corpus.json`).then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar el corpus: HTTP ${response.status}`);
      return response.json();
    });
  }
  return corpusPromise;
}

export async function loadEpisode(episodeId) {
  const corpus = await loadCorpus();
  return corpus.episodes?.find((episode) => episode.id === episodeId) ?? null;
}
