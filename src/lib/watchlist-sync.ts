import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { WatchlistEntry } from "@/lib/watchlist";

/**
 * Watchlist sync server functions.
 * Client keeps localStorage as instant cache and pushes the full entries array
 * after each change (see scheduleSync/pushToServer in the store).
 */

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
    // Pass a JSON string + explicit ::jsonb cast — reliable with node-postgres
    // parameterized queries (object binding can vary by driver version).
    const json = JSON.stringify(data.entries ?? []);
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
