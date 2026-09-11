const SESSION_KEY = 'fse:session:v1';

export function readSessionState() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSessionState(state) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // La persistencia es una mejora de UX; si sessionStorage no está disponible,
    // la app debe seguir funcionando normalmente.
  }
}

export function updateSessionScroll(scroll) {
  const current = readSessionState();
  if (!current) return;

  writeSessionState({
    ...current,
    scroll,
  });
}

export function clearSessionState() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Sin acción: la app puede continuar sin persistencia.
  }
}
