/**
 * Initial connectivity state, shared by the store and its tests.
 *
 * The obvious guard `typeof navigator !== "undefined" ? navigator.onLine : true`
 * is wrong on a modern server runtime: Node 21+ exposes a global `navigator`,
 * whose `onLine` is `undefined`. That read as *offline* during SSR, so the
 * "hors-ligne" banner was baked into the server HTML and then failed hydration
 * against the browser's real value, on every page load.
 *
 * Only an explicit `false` means offline; anything else (no navigator, no
 * `onLine`) means online.
 */
export function initialOnline(nav: { onLine?: boolean } | null | undefined): boolean {
  return nav?.onLine ?? true;
}