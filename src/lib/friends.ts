import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { mapRow, type ProfileRow, type PublicProfile } from "@/lib/profile";

export type FriendshipStatus = "none" | "pending_out" | "pending_in" | "friends" | "rejected";

export type FriendProfile = PublicProfile & {
  friendshipId?: string;
  since?: string;
};

export type FriendRequest = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  direction: "incoming" | "outgoing";
  other: PublicProfile;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

// Profile columns joined alongside a friendship row. Was previously its own
// narrower type mapped by a local, hand-rolled `mapProfile` that silently
// dropped every field the profile pack added later (visibility, favorites,
// showStats, showFavorites, anilistUrl, malUrl) — tsc caught the mismatch,
// but nothing at runtime would have: every friend/request profile handed to
// the UI had those fields `undefined` instead of their real values. Reusing
// `ProfileRow`/`mapRow` from lib/profile.ts keeps this in sync automatically.

function newId() {
  return `fr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function iso(v: string | Date) {
  return typeof v === "string" ? v : v.toISOString();
}

async function resolveUserIdByUsername(username: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select "user_id" from "user_profile"
    where lower("username") = lower(${username})
    limit 1
  `;
  return rows[0]?.user_id ?? null;
}

async function loadProfile(userId: string): Promise<PublicProfile | null> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select
      p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
      p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
      u."name", u."email", u."image"
    from "user_profile" p
    join "user" u on u."id" = p."user_id"
    where p."user_id" = ${userId}
    limit 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Send a friend request by username or userId. */
export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input as { username?: string; userId?: string } | null;
    const username = raw?.username?.trim().toLowerCase();
    const userId = raw?.userId?.trim();
    if (!username && !userId) throw new Error("Pseudo ou identifiant requis");
    return { username, userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true; requestId: string }> => {
    const me = context.userId;
    const sql = await getSql();

    let targetId = data.userId ?? null;
    if (!targetId && data.username) {
      targetId = await resolveUserIdByUsername(data.username);
    }
    if (!targetId) throw new Error("Utilisateur introuvable");
    if (targetId === me) throw new Error("Tu ne peux pas t’ajouter toi-même");

    // Existing relation either direction?
    const existing = await sql<FriendshipRow>`
      select * from "friendship"
      where
        ("requester_id" = ${me} and "addressee_id" = ${targetId})
        or ("requester_id" = ${targetId} and "addressee_id" = ${me})
      limit 1
    `;
    const row = existing[0];
    if (row) {
      if (row.status === "accepted") throw new Error("Vous êtes déjà amis");
      if (row.status === "pending") {
        if (row.requester_id === me) throw new Error("Demande déjà envoyée");
        // They already sent us one → auto-accept
        await sql`
          update "friendship"
          set "status" = 'accepted', "updated_at" = current_timestamp
          where "id" = ${row.id}
        `;
        return { ok: true, requestId: row.id };
      }
      // rejected → allow re-request by flipping roles to pending from me
      await sql`
        update "friendship"
        set
          "requester_id" = ${me},
          "addressee_id" = ${targetId},
          "status" = 'pending',
          "updated_at" = current_timestamp
        where "id" = ${row.id}
      `;
      return { ok: true, requestId: row.id };
    }

    const id = newId();
    await sql`
      insert into "friendship" ("id", "requester_id", "addressee_id", "status")
      values (${id}, ${me}, ${targetId}, 'pending')
    `;
    return { ok: true, requestId: id };
  });

/** Accept an incoming pending request. */
export const acceptFriendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = (input as { requestId?: string } | null)?.requestId?.trim();
    if (!id) throw new Error("Identifiant de demande manquant");
    return { requestId: id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<FriendshipRow>`
      select * from "friendship" where "id" = ${data.requestId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Demande introuvable");
    if (row.addressee_id !== context.userId) throw new Error("Cette demande ne t’est pas destinée");
    if (row.status !== "pending") throw new Error("Cette demande n’est plus en attente");

    await sql`
      update "friendship"
      set "status" = 'accepted', "updated_at" = current_timestamp
      where "id" = ${data.requestId}
    `;
    return { ok: true };
  });

/** Refuse an incoming pending request. */
export const rejectFriendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = (input as { requestId?: string } | null)?.requestId?.trim();
    if (!id) throw new Error("Identifiant de demande manquant");
    return { requestId: id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<FriendshipRow>`
      select * from "friendship" where "id" = ${data.requestId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Demande introuvable");
    if (row.addressee_id !== context.userId) throw new Error("Cette demande ne t’est pas destinée");
    if (row.status !== "pending") throw new Error("Cette demande n’est plus en attente");

    await sql`
      update "friendship"
      set "status" = 'rejected', "updated_at" = current_timestamp
      where "id" = ${data.requestId}
    `;
    return { ok: true };
  });

/** Cancel an outgoing pending request or remove an accepted friendship. */
export const removeFriendship = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input as { requestId?: string; userId?: string } | null;
    const requestId = raw?.requestId?.trim();
    const userId = raw?.userId?.trim();
    if (!requestId && !userId) throw new Error("Identifiant requis");
    return { requestId, userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const me = context.userId;
    const sql = await getSql();

    if (data.requestId) {
      const rows = await sql<FriendshipRow>`
        select * from "friendship" where "id" = ${data.requestId} limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("Relation introuvable");
      if (row.requester_id !== me && row.addressee_id !== me) {
        throw new Error("Pas autorisé");
      }
      await sql`delete from "friendship" where "id" = ${data.requestId}`;
      return { ok: true };
    }

    // By other user id
    await sql`
      delete from "friendship"
      where
        ("requester_id" = ${me} and "addressee_id" = ${data.userId})
        or ("requester_id" = ${data.userId} and "addressee_id" = ${me})
    `;
    return { ok: true };
  });

/** List accepted friends. */
export const listFriends = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FriendProfile[]> => {
    const me = context.userId;
    const sql = await getSql();
    const rows = await sql<
      FriendshipRow & ProfileRow & { other_id: string }
    >`
      select
        f."id", f."requester_id", f."addressee_id", f."status", f."created_at", f."updated_at",
        case when f."requester_id" = ${me} then f."addressee_id" else f."requester_id" end as other_id,
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
        u."name", u."email", u."image"
      from "friendship" f
      join "user_profile" p on p."user_id" = case
        when f."requester_id" = ${me} then f."addressee_id"
        else f."requester_id"
      end
      join "user" u on u."id" = p."user_id"
      where f."status" = 'accepted'
        and (f."requester_id" = ${me} or f."addressee_id" = ${me})
      order by coalesce(p."display_name", p."username") asc
    `;
    return rows.map((r) => ({
      ...mapRow(r),
      friendshipId: r.id,
      since: iso(r.updated_at || r.created_at),
    }));
  });

/** Incoming + outgoing pending requests. */
export const listFriendRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> => {
    const me = context.userId;
    const sql = await getSql();
    const rows = await sql<FriendshipRow & ProfileRow & { other_id: string }>`
      select
        f."id", f."requester_id", f."addressee_id", f."status", f."created_at", f."updated_at",
        case when f."requester_id" = ${me} then f."addressee_id" else f."requester_id" end as other_id,
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
        u."name", u."email", u."image"
      from "friendship" f
      join "user_profile" p on p."user_id" = case
        when f."requester_id" = ${me} then f."addressee_id"
        else f."requester_id"
      end
      join "user" u on u."id" = p."user_id"
      where f."status" = 'pending'
        and (f."requester_id" = ${me} or f."addressee_id" = ${me})
      order by f."created_at" desc
    `;

    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const r of rows) {
      const item: FriendRequest = {
        id: r.id,
        status: "pending",
        createdAt: iso(r.created_at),
        direction: r.addressee_id === me ? "incoming" : "outgoing",
        other: mapRow(r),
      };
      if (item.direction === "incoming") incoming.push(item);
      else outgoing.push(item);
    }
    return { incoming, outgoing };
  });

/** Relationship between me and another user (for profile buttons). */
export const getFriendshipWith = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const userId = (input as { userId?: string } | null)?.userId?.trim();
    const username = (input as { username?: string } | null)?.username?.trim().toLowerCase();
    if (!userId && !username) throw new Error("userId ou username requis");
    return { userId, username };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<{ status: FriendshipStatus; requestId?: string; otherUserId?: string }> => {
      const me = context.userId;
      let otherId = data.userId ?? null;
      if (!otherId && data.username) otherId = await resolveUserIdByUsername(data.username);
      if (!otherId) return { status: "none" };
      if (otherId === me) return { status: "none", otherUserId: me };

      const sql = await getSql();
      const rows = await sql<FriendshipRow>`
        select * from "friendship"
        where
          ("requester_id" = ${me} and "addressee_id" = ${otherId})
          or ("requester_id" = ${otherId} and "addressee_id" = ${me})
        limit 1
      `;
      const row = rows[0];
      if (!row) return { status: "none", otherUserId: otherId };
      if (row.status === "accepted") {
        return { status: "friends", requestId: row.id, otherUserId: otherId };
      }
      if (row.status === "rejected") {
        return { status: "rejected", requestId: row.id, otherUserId: otherId };
      }
      // pending
      if (row.requester_id === me) {
        return { status: "pending_out", requestId: row.id, otherUserId: otherId };
      }
      return { status: "pending_in", requestId: row.id, otherUserId: otherId };
    },
  );

/** Resolve friend profiles by user ids (for "Vu avec" display). */
export const resolveFriendProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const ids = (input as { userIds?: string[] } | null)?.userIds;
    if (!Array.isArray(ids)) return { userIds: [] as string[] };
    return { userIds: ids.filter((x) => typeof x === "string" && x.length > 0).slice(0, 40) };
  })
  .handler(async ({ data }): Promise<PublicProfile[]> => {
    if (!data.userIds.length) return [];
    // pg/pglite tagged template doesn't expand arrays easily — resolve one by one.
    const out: PublicProfile[] = [];
    for (const id of data.userIds) {
      const p = await loadProfile(id);
      if (p) out.push(p);
    }
    return out;
  });
