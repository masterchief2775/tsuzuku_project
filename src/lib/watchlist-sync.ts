import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { WatchlistEntry } from "@/lib/watchlist";
import { lenientObject, z } from "@/lib/validation";
import {
  MAX_PATCH_ENTRIES,
  mergeWatchlistPatch,
  normalizeEntries,
  sanitizePatchEntries,
} from "@/lib/watchlist-patch";

/**
 * Watchlist sync server functions.
 * Client keeps localStorage as instant cache and pushes incremental patches
 * (`saveWatchlistPatch`) after each change (see scheduleSync/pushToServer in
 * the store) — a +1 episode sends ~2Ko instead of the whole ~500Ko list.
 * `saveWatchlistState` (full overwrite) is kept for initial seeding compat.
 * Pure merge/normalize core lives in `watchlist-patch.ts` (unit-tested).
 */

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
    const { merged, applied } = mergeWatchlistPatch(current, data.upsert, data.deletedIds);
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
