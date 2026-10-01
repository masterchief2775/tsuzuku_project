import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { WatchlistEntry } from "@/lib/watchlist";

/**
 * Watchlist sync server functions.
 * Client keeps localStorage as instant cache and pushes incremental patches
 * (`saveWatchlistPatch`) after each change (see scheduleSync/pushToServer in
 * the store) — a +1 episode sends ~2Ko instead of the whole ~500Ko list.
 * `saveWatchlistState` (full overwrite) is kept for initial seeding compat.
 */

const MAX_PATCH_ENTRIES = 200;
const MAX_FULL_ENTRIES = 5000;
/** Rough JSONB safety cap — rejects runaway payloads before they hit Neon. */
const MAX_JSON_BYTES = 3_000_000;

function normalizeEntries(raw: unknown): WatchlistEntry[] {
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

export const fetchWatchlistState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WatchlistEntry[] | null> => {
    const sql = await getSql();
    const rows = await sql<{ entries: unknown }>`
      select "entries" from "watchlist_state" where "user_id" = ${context.userId}
    `;
    if (!rows[0]) return null; // no row yet
    return normalizeEntries(rows[0].entries);
  });

export const saveWatchlistState = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    // Client calls: saveWatchlistState({ data: { entries } })
    // Validator receives the inner `data` payload.
    const payload = input as { entries?: unknown } | unknown[] | null;
    const entries = Array.isArray(payload)
      ? payload
      : (payload as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) {
      throw new Error("Invalid watchlist payload: 'entries' must be an array");
    }
    return { entries: entries as WatchlistEntry[] };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; count: number }> => {
    const sql = await getSql();
    if (data.entries.length > MAX_FULL_ENTRIES) {
      throw new Error("Watchlist trop volumineuse pour un sync complet");
    }
    // Pass a JSON string + explicit ::jsonb cast — reliable with node-postgres
    // parameterized queries (object binding can vary by driver version).
    const json = JSON.stringify(data.entries ?? []);
    if (json.length > MAX_JSON_BYTES) {
      throw new Error("Payload watchlist trop volumineux");
    }
    await sql`
      insert into "watchlist_state" ("user_id", "entries", "updated_at")
      values (${context.userId}, ${json}::jsonb, current_timestamp)
      on conflict ("user_id")
      do update set
        "entries" = excluded."entries",
        "updated_at" = excluded."updated_at"
    `;
    return { ok: true, count: data.entries.length };
  });

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sanitizePatchEntries(raw: unknown): WatchlistEntry[] {
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

/**
 * Incremental sync: merge `upsert` entries into the stored array by `id`
 * (fallback dedup by `anilistId` for legacy duplicates) and drop `deletedIds`.
 * One +1 episode = one small row merged server-side instead of re-uploading
 * the whole list — ~250x less egress per keystroke.
 */
export const saveWatchlistPatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const payload = input as { upsert?: unknown; deletedIds?: unknown } | null;
    const upsert = sanitizePatchEntries(payload?.upsert ?? []);
    const rawDeleted = Array.isArray(payload?.deletedIds) ? payload.deletedIds : [];
    if (rawDeleted.length > MAX_PATCH_ENTRIES) {
      throw new Error("Patch trop volumineux — utilise un sync complet");
    }
    const deletedIds = rawDeleted.filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 80);
    if (upsert.length === 0 && deletedIds.length === 0) {
      throw new Error("Patch vide — rien à synchroniser");
    }
    return { upsert, deletedIds };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; total: number; applied: number }> => {
    const sql = await getSql();
    const rows = await sql<{ entries: unknown }>`
      select "entries" from "watchlist_state" where "user_id" = ${context.userId}
    `;
    const current = normalizeEntries(rows[0]?.entries);
    const deleted = new Set(data.deletedIds);
    const byId = new Map(current.map((e) => [e.id, e]));
    let applied = 0;
    for (const entry of data.upsert) {
      byId.set(entry.id, entry);
      applied += 1;
    }
    // Legacy guard: same anilistId twice (old full-overwrite duplicates) —
    // keep the most recently updated one.
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
      const t = +new Date(entry.updatedAt || entry.addedAt || 0);
      const pt = +new Date(prev.updatedAt || prev.addedAt || 0);
      const keep = t >= pt ? entry : prev;
      seenAnilist.set(entry.anilistId, keep);
      const idx = merged.indexOf(prev);
      if (keep !== prev && idx >= 0) merged[idx] = keep;
    }
    const json = JSON.stringify(merged);
    if (json.length > MAX_JSON_BYTES) {
      throw new Error("Watchlist résultante trop volumineuse");
    }
    await sql`
      insert into "watchlist_state" ("user_id", "entries", "updated_at")
      values (${context.userId}, ${json}::jsonb, current_timestamp)
      on conflict ("user_id")
      do update set
        "entries" = excluded."entries",
        "updated_at" = excluded."updated_at"
    `;
    return { ok: true, total: merged.length, applied };
  });
