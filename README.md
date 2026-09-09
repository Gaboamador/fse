# Friends Search Engine

Frontend React + Vite para búsqueda semántica de transcripciones de *Friends*.

## Arquitectura actual

- La búsqueda se ejecuta en el backend Cloudflare Worker.
- El navegador no descarga el modelo de embeddings ni matrices `.f32`.
- `src/search/searchClient.js` conserva la API usada por la UI (`initializeSearch()` y `searchFriends()`).
- `public/data/friends-corpus.json` se conserva para `Ver capítulo completo`; se carga sólo cuando el usuario abre una transcripción completa.

## Desarrollo

```bash
npm install
npm run dev
```

La URL del backend se configura en `.env.local`:

```text
VITE_SEARCH_API_URL
```

## Build

```bash
npm run build
```

`dist/` es generado por Vite y no se versiona.
