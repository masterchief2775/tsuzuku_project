/**
 * TLS decision for the Postgres pool — pure, no imports, so it can be unit
 * tested without pulling `db.ts` (and its Neon/PGLite side effects) into the
 * test runner. Same split as `block-guards.ts` vs `blocks.server.ts`.
 */

const TLS_HOSTS = /neon\.tech|supabase\.co|render\.com/i;

/** The explicit `sslmode` in the URL, lowercased, or null. */
export function sslModeOf(url: string): string | null {
  const m = /sslmode=([a-z-]+)/i.exec(url);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * `true` only when the URL explicitly asks for the server certificate to be
 * verified. `require` / `prefer` / `verify-ca` encrypt without authenticating
 * the server, so they must NOT enable verification.
 */
export function asksForCertificateCheck(url: string): boolean {
  return sslModeOf(url) === "verify-full";
}

/** Whether the pool must open a TLS connection at all. */
export function needsTls(url: string): boolean {
  const mode = sslModeOf(url);
  if (mode) {
    return mode === "require" || mode === "prefer" || mode === "verify-ca" || mode === "verify-full";
  }
  return TLS_HOSTS.test(url);
}

/**
 * Conservative by design: only an explicit `verify-full` turns verification on,
 * so no deployment that works today changes behaviour. Reading `verify-full` as
 * "no verification" was the bug — a connection string that explicitly asked for
 * certificate checking silently got none.
 */
export function rejectUnauthorized(url: string): boolean {
  return asksForCertificateCheck(url);
}