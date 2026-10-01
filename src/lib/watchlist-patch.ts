import type { WatchlistEntry } from "./watchlist.ts";

/**
 * Pure core of the incremental watchlist sync (no DB, no framework).
 * Tested in `watchlist-patch.test.ts`; used by `watchlist-sync.ts`.
 */

export const MAX_PATCH_ENTRIES = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function normalizeEntries(raw: unknown): WatchlistEntry[] {
  if (raw == null) return [];
  // Guard against double-encoded JSONB (string stored inside jsonb)
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value as WatchlistEntry[];
}

export function sanitizePatchEntries(raw: unknown): WatchlistEntry[] {
  if (!Array.isArray(raw)) throw new Error("Invalid patch: 'upsert' must be an array");
  if (raw.length > MAX_PATCH_ENTRIES) {
    throw new Error("Patch trop volumineux — utilise un sync complet");
  }
  const out: WatchlistEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) throw new Error("Invalid patch entry");
    const id = typeof item.id === "string" ? item.id.slice(0, 80) : "";
    const anilistId = Number(item.anilistId);
    if (!id || !Number.isFinite(anilistId) || anilistId <= 0) {
      throw new Error("Invalid patch entry: id/anilistId requis");
    }
    out.push(item as WatchlistEntry);
  }
  return out;
}

function entryTime(e: WatchlistEntry): number {
  return +new Date(e.updatedAt || e.addedAt || 0);
}

/**
 * Merge a patch into the stored array: upserts win by `id`, deletions drop,
 * legacy duplicate `anilistId`s collapse to the most recently updated entry.
 */
export function mergeWatchlistPatch(
  current: WatchlistEntry[],
  upsert: WatchlistEntry[],
  deletedIds: string[],
): { merged: WatchlistEntry[]; applied: number } {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.map((e) => [e.id, e]));
  let applied = 0;
  for (const entry of upsert) {
    byId.set(entry.id, entry);
    applied += 1;
  }
  const seenAnilist = new Map<number, WatchlistEntry>();
  const merged: WatchlistEntry[] = [];
  for (const entry of byId.values()) {
    if (deleted.has(entry.id)) {
      applied += 1;
      continue;
    }
    const prev = seenAnilist.get(entry.anilistId);
    if (!prev) {
      seenAnilist.set(entry.anilistId, entry);
      merged.push(entry);
      continue;
    }
    const keep = entryTime(entry) >= entryTime(prev) ? entry : prev;
    seenAnilist.set(entry.anilistId, keep);
    const idx = merged.indexOf(prev);
    if (keep !== prev && idx >= 0) merged[idx] = keep;
  }
  return { merged, applied };
}
