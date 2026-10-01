import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { WatchlistEntry } from "@/lib/watchlist";
import { lenientObject, z } from "@/lib/validation";

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

const fullSyncInput = z.preprocess(
  (v) => (Array.isArray(v) ? { entries: v } : v),
  lenientObject({
    entries: z
      .array(z.unknown())
      .max(MAX_FULL_ENTRIES, "Watchlist trop volumineuse pour un sync complet"),
  }),
);

const patchEnvelopeInput = lenientObject({
  upsert: z.unknown().optional(),
  deletedIds: z.unknown().optional(),
});

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

export type WatchlistSnapshot = {
  entries: WatchlistEntry[] | null;
  /** Server `updated_at` — lets the client skip a full pull when unchanged. */
  updatedAt: string | null;
};

function isoDate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString();
}

export const fetchWatchlistState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WatchlistSnapshot> => {
    const sql = await getSql();
    const rows = await sql<{ entries: unknown; updated_at: string | Date | null }>`
      select "entries", "updated_at" from "watchlist_state" where "user_id" = ${context.userId}
    `;
    if (!rows[0]) return { entries: null, updatedAt: null }; // no row yet
    return { entries: normalizeEntries(rows[0].entries), updatedAt: isoDate(rows[0].updated_at) };
  });

/**
 * Cheap version probe (PK lookup, no JSONB): the client compares `updatedAt`
 * with its `lastSyncedAt` and only pulls the full list when the server moved
 * (other device wrote). Costs ~bytes instead of ~500Ko per check.
 */
export const getWatchlistVersion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ updatedAt: string | null }> => {
    const sql = await getSql();
    const rows = await sql<{ updated_at: string | Date | null }>`
      select "updated_at" from "watchlist_state" where "user_id" = ${context.userId}
    `;
    return { updatedAt: isoDate(rows[0]?.updated_at) };
  });

export const saveWatchlistState = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    // Client calls: saveWatchlistState({ data: { entries } })
    // Validator receives the inner `data` payload (or a bare array, legacy —
    // normalized by the schema's preprocess).
    const parsed = fullSyncInput.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(first?.message || "Invalid watchlist payload: 'entries' must be an array");
    }
    return { entries: parsed.data.entries as WatchlistEntry[] };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; count: number; updatedAt: string | null }> => {
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
    const rows = await sql<{ updated_at: string | Date | null }>`
      insert into "watchlist_state" ("user_id", "entries", "updated_at")
      values (${context.userId}, ${json}::jsonb, current_timestamp)
      on conflict ("user_id")
      do update set
        "entries" = excluded."entries",
        "updated_at" = excluded."updated_at"
      returning "updated_at"
    `;
    return { ok: true, count: data.entries.length, updatedAt: isoDate(rows[0]?.updated_at) };
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
    const parsed = patchEnvelopeInput.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(first?.message || "Patch invalide");
    }
    const upsert = sanitizePatchEntries(parsed.data.upsert ?? []);
    const rawDeleted = Array.isArray(parsed.data.deletedIds) ? parsed.data.deletedIds : [];
    if (rawDeleted.length > MAX_PATCH_ENTRIES) {
      throw new Error("Patch trop volumineux — utilise un sync complet");
    }
    const deletedIds = rawDeleted.filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 80);
    if (upsert.length === 0 && deletedIds.length === 0) {
      throw new Error("Patch vide — rien à synchroniser");
    }
    return { upsert, deletedIds };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; total: number; applied: number; updatedAt: string | null }> => {
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
    const saved = await sql<{ updated_at: string | Date | null }>`
      insert into "watchlist_state" ("user_id", "entries", "updated_at")
      values (${context.userId}, ${json}::jsonb, current_timestamp)
      on conflict ("user_id")
      do update set
        "entries" = excluded."entries",
        "updated_at" = excluded."updated_at"
      returning "updated_at"
    `;
    return { ok: true, total: merged.length, applied, updatedAt: isoDate(saved[0]?.updated_at) };
  });
