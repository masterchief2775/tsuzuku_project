import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { WatchlistEntry } from "@/lib/watchlist";
import { lenientObject, shareTokenField, zValidator } from "@/lib/validation";
import { toPublic, type PublicSharePayload } from "@/lib/share-public";
import { newToken } from "@/lib/ids";

// The projection, its allow-list and the card title live in `./share-public`
// (no server imports) so they can be unit-tested — see the note there.
export {
  PRIVATE_ENTRY_FIELDS,
  PUBLIC_SHARE_FIELDS,
  shareCardTitle,
  toPublic,
  type PublicShareEntry,
  type PublicSharePayload,
} from "@/lib/share-public";

export const getShareSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ token: string; enabled: boolean }>`
      select "token", "enabled" from "watchlist_share" where "user_id" = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return { enabled: false, token: null as string | null };
    return { enabled: row.enabled, token: row.enabled ? row.token : null };
  });

export const enableShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const token = newToken("shr");
    await sql`
      insert into "watchlist_share" ("user_id", "token", "enabled", "updated_at")
      values (${context.userId}, ${token}, true, current_timestamp)
      on conflict ("user_id")
      do update set "token" = excluded."token", "enabled" = true, "updated_at" = current_timestamp
    `;
    return { enabled: true, token };
  });

export const disableShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // Rotate token away so old links die immediately
    const dead = newToken("shr");
    await sql`
      insert into "watchlist_share" ("user_id", "token", "enabled", "updated_at")
      values (${context.userId}, ${dead}, false, current_timestamp)
      on conflict ("user_id")
      do update set "token" = excluded."token", "enabled" = false, "updated_at" = current_timestamp
    `;
    return { enabled: false, token: null as string | null };
  });

/** Public, unauthenticated read by token */
export const fetchPublicShare = createServerFn({ method: "GET" })
  .validator(zValidator(lenientObject({ token: shareTokenField })))
  .handler(async ({ data }): Promise<PublicSharePayload | null> => {
    const sql = await getSql();
    const shareRows = await sql<{ user_id: string; enabled: boolean }>`
      select "user_id", "enabled" from "watchlist_share" where "token" = ${data.token}
    `;
    const share = shareRows[0];
    if (!share || !share.enabled) return null;

    const stateRows = await sql<{ entries: WatchlistEntry[] }>`
      select "entries" from "watchlist_state" where "user_id" = ${share.user_id}
    `;
    const entries = stateRows[0]?.entries ?? [];
    const pub = toPublic(entries);
    let ownerName: string | null = null;
    try {
      const prof = await sql<{
        display_name: string | null;
        username: string | null;
        name: string | null;
      }>`
        select p."display_name", p."username", u."name"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where p."user_id" = ${share.user_id}
        limit 1
      `;
      const p = prof[0];
      ownerName = p?.display_name || p?.name || p?.username || null;
    } catch {
      /* name stays null — title falls back to a generic label */
    }
    return { entries: pub, count: pub.length, ownerName };
  });
