import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isBlockedBetween } from "@/lib/blocks";

export type ActivityKind =
  | "completed"
  | "rated"
  | "friend_request"
  | "friend_accept";

export type ActivityItem = {
  id: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  actorAvatar: string | null;
  kind: ActivityKind;
  title: string | null;
  anilistId: number | null;
  image: string | null;
  rating: number | null;
  createdAt: string;
  readAt: string | null;
};

type ActivityRow = {
  id: string;
  actor_id: string;
  kind: string;
  title: string | null;
  anilist_id: number | null;
  image: string | null;
  rating: number | null;
  created_at: string | Date;
  read_at: string | Date | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  name: string | null;
  user_image: string | null;
};

function iso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString();
}

function newId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapRow(r: ActivityRow): ActivityItem {
  return {
    id: r.id,
    actorId: r.actor_id,
    actorName: r.display_name || r.name || r.username || "Ami",
    actorUsername: r.username || "user",
    actorAvatar: r.avatar_url || r.user_image || null,
    kind: r.kind as ActivityKind,
    title: r.title,
    anilistId: r.anilist_id,
    image: r.image,
    rating: r.rating,
    createdAt: iso(r.created_at) || new Date().toISOString(),
    readAt: iso(r.read_at),
  };
}

async function friendIdsOf(userId: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select case
      when f."requester_id" = ${userId} then f."addressee_id"
      else f."requester_id"
    end as id
    from "friendship" f
    where f."status" = 'accepted'
      and (f."requester_id" = ${userId} or f."addressee_id" = ${userId})
  `;
  return rows.map((r) => r.id);
}

/**
 * Fan-out an activity to all accepted friends of the actor (excluding blocks).
 * Best-effort: failures are swallowed so the main user action never fails.
 */
export async function fanOutToFriends(input: {
  actorId: string;
  kind: ActivityKind;
  title?: string | null;
  anilistId?: number | null;
  image?: string | null;
  rating?: number | null;
  /** If set, only this recipient gets the event (e.g. friend request target). */
  onlyRecipientId?: string;
}): Promise<void> {
  try {
    const sql = await getSql();
    let recipients: string[];
    if (input.onlyRecipientId) {
      recipients = [input.onlyRecipientId];
    } else {
      recipients = await friendIdsOf(input.actorId);
    }
    if (recipients.length === 0) return;

    for (const recipientId of recipients) {
      if (recipientId === input.actorId) continue;
      if (await isBlockedBetween(input.actorId, recipientId)) continue;
      const id = newId();
      await sql`
        insert into "friend_activity" (
          "id", "recipient_id", "actor_id", "kind",
          "title", "anilist_id", "image", "rating"
        ) values (
          ${id},
          ${recipientId},
          ${input.actorId},
          ${input.kind},
          ${input.title ?? null},
          ${input.anilistId ?? null},
          ${input.image ?? null},
          ${input.rating ?? null}
        )
      `;
    }
  } catch (err) {
    console.error("[activity] fanOut failed", err);
  }
}

export const publishWatchActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input as {
      kind?: string;
      title?: string;
      anilistId?: number;
      image?: string | null;
      rating?: number | null;
    } | null;
    const kind = raw?.kind;
    if (kind !== "completed" && kind !== "rated") {
      throw new Error("Type d’activité invalide");
    }
    const title = String(raw?.title || "").trim().slice(0, 200);
    if (!title) throw new Error("Titre manquant");
    const anilistId = Number(raw?.anilistId);
    return {
      kind: kind as "completed" | "rated",
      title,
      anilistId: Number.isFinite(anilistId) && anilistId > 0 ? anilistId : null,
      image: typeof raw?.image === "string" ? raw.image : null,
      rating:
        typeof raw?.rating === "number" && raw.rating >= 0 && raw.rating <= 10
          ? raw.rating
          : null,
    };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await fanOutToFriends({
      actorId: context.userId,
      kind: data.kind,
      title: data.title,
      anilistId: data.anilistId,
      image: data.image,
      rating: data.rating,
    });
    return { ok: true };
  });

export const listFriendActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const limit = Math.min(
      50,
      Math.max(1, Number((input as { limit?: number } | null)?.limit) || 20),
    );
    return { limit };
  })
  .handler(async ({ context, data }): Promise<ActivityItem[]> => {
    const sql = await getSql();
    try {
      const rows = await sql<ActivityRow>`
        select
          a."id", a."actor_id", a."kind", a."title", a."anilist_id", a."image",
          a."rating", a."created_at", a."read_at",
          p."display_name", p."username", p."avatar_url",
          u."name", u."image" as user_image
        from "friend_activity" a
        join "user" u on u."id" = a."actor_id"
        left join "user_profile" p on p."user_id" = a."actor_id"
        where a."recipient_id" = ${context.userId}
        order by a."created_at" desc
        limit ${data.limit}
      `;
      return rows.map(mapRow);
    } catch {
      return [];
    }
  });

export const getActivityBadge = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{ unreadActivity: number; pendingFriendRequests: number }> => {
      const sql = await getSql();
      let unreadActivity = 0;
      let pendingFriendRequests = 0;
      try {
        const a = await sql<{ n: string }>`
          select count(*)::text as n from "friend_activity"
          where "recipient_id" = ${context.userId} and "read_at" is null
        `;
        unreadActivity = Number(a[0]?.n || 0);
      } catch {
        /* table missing */
      }
      try {
        const f = await sql<{ n: string }>`
          select count(*)::text as n from "friendship"
          where "addressee_id" = ${context.userId} and "status" = 'pending'
        `;
        pendingFriendRequests = Number(f[0]?.n || 0);
      } catch {
        /* ignore */
      }
      return { unreadActivity, pendingFriendRequests };
    },
  );

export const markActivityRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    try {
      await sql`
        update "friend_activity"
        set "read_at" = current_timestamp
        where "recipient_id" = ${context.userId} and "read_at" is null
      `;
    } catch {
      /* ignore */
    }
    return { ok: true };
  });
