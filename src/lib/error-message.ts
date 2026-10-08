/**
 * Turns technical fetch failures into something a viewer can act on.
 * API clients throw raw statuses (`Erreur 503`, `Auth disabled`) or browser
 * network errors — injecting those verbatim into the UI reads as a crash.
 * Anything already human (AniList messages, validation) passes through.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message.trim() : "";
  if (/\b50\d\b/.test(raw) || /auth disabled/i.test(raw)) {
    return "Le service est momentanément indisponible. Réessaie dans un instant.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return "Pas de connexion au serveur. Vérifie ton réseau puis réessaie.";
  }
  if (/\b401\b|\b403\b/.test(raw) || /unauthorized|forbidden|session expir/i.test(raw)) {
    return "Ta session a expiré. Reconnecte-toi puis réessaie.";
  }
  if (raw) return raw;
  return fallback;
}
