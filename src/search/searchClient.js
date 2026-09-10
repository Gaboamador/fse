const SEARCH_API_URL = String(import.meta.env.VITE_SEARCH_API_URL ?? '').trim().replace(/\/+$/, '');

function emitStatus(phase, message) {
  window.dispatchEvent(new CustomEvent('friends-search-status', {
    detail: { phase, message },
  }));
}

function requireApiUrl() {
  if (!SEARCH_API_URL) {
    throw new Error('VITE_SEARCH_API_URL no está configurada para el backend Cloudflare.');
  }
  return SEARCH_API_URL;
}

async function requestCloudflare(path, options = {}) {
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Backend: HTTP ${response.status} sin JSON válido.`);
  }

  if (!response.ok) {
    throw new Error(body?.error ?? `Backend: HTTP ${response.status}`);
  }

  return body;
}

export async function initializeSearch() {
  emitStatus('loading', 'Conectando con el buscador…');

  try {
    const health = await requestCloudflare('/health', { method: 'GET', headers: {} });
    emitStatus('ready', 'Online');
    return health;
  } catch (error) {
    emitStatus('error', error?.message ?? String(error));
    throw error;
  }
}

export async function searchFriends(query, options = {}) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) throw new Error('La consulta está vacía.');

  emitStatus('searching', `Buscando “${trimmed.slice(0, 70)}${trimmed.length > 70 ? '…' : ''}”`);

  try {
    const result = await requestCloudflare('/search', {
      method: 'POST',
      body: JSON.stringify({ query: trimmed, ...options }),
    });
    emitStatus('ready', 'Online');
    return result;
  } catch (error) {
    emitStatus('error', error?.message ?? String(error));
    throw error;
  }
}
