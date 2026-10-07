/**
 * Opaque id, token and timestamp helpers.
 *
 * Every one of these existed as a private copy in six modules, and they had
 * drifted in ways that mattered:
 *   - `iso()` had two different signatures (only `activity.ts` was null-safe),
 *   - `newId()` used `Math.random()` in four places while `party.ts` already
 *     used `randomBytes`, so how strong an id was depended on which file
 *     generated it,
 *   - the token helpers mixed `Math.random()`, `crypto.getRandomValues` and
 *     `randomBytes`.
 *
 * Isomorphic on purpose: `crypto.getRandomValues` is a global in browsers and
 * in Node 19+, so this works in both without importing `node:crypto` into
 * anything that reaches the client bundle.
 */

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ISO string for a nullable DB timestamp. */
export function isoDate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString();
}

/** Same, for columns declared NOT NULL (passes the value through untouched). */
export function isoDateRequired(v: string | Date): string {
  return typeof v === "string" ? v : v.toISOString();
}

/**
 * Row id: `<prefix>_<base36 time>_<csprng hex>`.
 *
 * The random half is CSPRNG rather than `Math.random()`; the timestamp is kept
 * only because it makes ids roughly sortable while debugging. Ids are opaque and
 * stored as text, so the format change is not a migration concern.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomHex(6)}`;
}

/** Opaque secret (invite links, share links, party tokens). */
export function newToken(prefix: string, bytes = 18): string {
  return `${prefix}_${randomHex(bytes)}`;
}