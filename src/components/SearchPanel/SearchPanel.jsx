export default function SearchPanel({
  query,
  onQueryChange,
  onSearch,
  onClear,
  ready,
  busy,
}) {
  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSearch(event);
    }
  }

  return (
    <form onSubmit={onSearch} className="search-panel">
      <div className="textarea-wrap">
        <textarea
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          spellCheck="false"
        />

        {query && (
          <button
            type="button"
            className="clear-search"
            onClick={onClear}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      <div className="controls">
        <button type="submit" disabled={!ready || busy || !query.trim()}>
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
        <span className="enter-hint">Enter para buscar · Shift+Enter para nueva línea</span>
      </div>
    </form>
  );
}
