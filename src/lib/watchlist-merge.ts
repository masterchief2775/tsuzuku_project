import type { WatchlistEntry } from "./watchlist.ts";

/**
 * Client merge policy (no store, no network). Tested in
 * `watchlist-merge.test.ts`; used by the zustand store.
 */

/** Union by anilistId — keep the most recently updated entry when both sides have it. */
export function mergeWatchlists(
  local: WatchlistEntry[],
  remote: WatchlistEntry[],
): WatchlistEntry[] {
  const map = new Map<number, WatchlistEntry>();
  for (const e of remote) map.set(e.anilistId, e);
  for (const e of local) {
    const existing = map.get(e.anilistId);
    if (!existing) {
      map.set(e.anilistId, e);
      continue;
    }
    const localT = +new Date(e.updatedAt || e.addedAt || 0);
    const remoteT = +new Date(existing.updatedAt || existing.addedAt || 0);
    if (localT >= remoteT) map.set(e.anilistId, e);
  }
  return [...map.values()].sort(
    (a, b) => +new Date(b.updatedAt || b.addedAt) - +new Date(a.updatedAt || a.addedAt),
  );
}

/** Local entries the server lacks, or that are newer than the server copy. */
export function localNewerThanRemote(
  local: WatchlistEntry[],
  remote: WatchlistEntry[],
): WatchlistEntry[] {
  const remoteByAnilist = new Map(remote.map((e) => [e.anilistId, e]));
  return local.filter((e) => {
    const r = remoteByAnilist.get(e.anilistId);
    if (!r) return true;
    return +new Date(e.updatedAt || e.addedAt || 0) > +new Date(r.updatedAt || r.addedAt || 0);
  });
}
