import { useEffect, useRef, useState } from 'react';

import styles from './SearchPanel.module.scss';

export default function SearchPanel({
  query,
  onQueryChange,
  onSearch,
  onClear,
  ready,
  busy,
  initialCollapsed = false,
}) {
  const textareaRef = useRef(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !collapsed) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [collapsed, query]);

  function submitSearch(event) {
    event?.preventDefault();

    if (!ready || busy || !query.trim()) return;

    setCollapsed(true);
    textareaRef.current?.blur();

    onSearch(event);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      submitSearch(event);
    }
  }

  function handleFocus() {
    setCollapsed(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }
  }

  function handleClear() {
    setCollapsed(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }

    onClear();
  }

  return (
    <form onSubmit={submitSearch} className={styles.searchPanel}>
      <div className={styles.textareaWrap}>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          rows={collapsed ? 1 : 3}
          spellCheck="false"
        />

        {query && (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={handleClear}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <button type="submit" disabled={!ready || busy || !query.trim()}>
          {busy ? 'Buscando…' : 'Buscar'}
        </button>

        <span className={styles.enterHint}>
          Enter para buscar · Shift+Enter para nueva línea
        </span>
      </div>
    </form>
  );
}
