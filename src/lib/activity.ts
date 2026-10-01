import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { lenientObject, z, zValidator } from "@/lib/validation";

const publishActivityInput = lenientObject({
  kind: z.enum(["completed", "rated"], { message: "Type d’activité invalide" }),
  // Mirrors the old manual behavior: coerce to string, trim, cap at 200, required.
  title: z.preprocess(
    (v) => String(v ?? "").trim().slice(0, 200),
    z.string().min(1, "Titre manquant"),
  ),
  anilistId: z.preprocess(
    (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    z.number().nullable(),
  ),
  image: z.preprocess(
    (v) => (typeof v === "string" ? v : null),
    z.string().nullable(),
  ),
  rating: z.preprocess(
    (v) => (typeof v === "number" && v >= 0 && v <= 10 ? v : null),
    z.number().min(0).max(10).nullable(),
  ),
});

const activityLimitInput = lenientObject({
  limit: z
    .unknown()
    .optional()
    .transform((v) => Math.min(50, Math.max(1, Number(v) || 20))),
});

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

function iso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString();
}

export const publishWatchActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(publishActivityInput))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { fanOutToFriends } = await import("@/lib/activity-fanout.server");
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
  .validator(zValidator(activityLimitInput))
  .handler(async ({ context, data }): Promise<ActivityItem[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      const rows = await sql<{
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
      }>`
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
      return rows.map((r) => ({
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
      }));
    } catch {
      return [];
    }
  });

export const getActivityBadge = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
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
      /* */
    }
    try {
      const f = await sql<{ n: string }>`
        select count(*)::text as n from "friendship"
        where "addressee_id" = ${context.userId} and "status" = 'pending'
      `;
      pendingFriendRequests = Number(f[0]?.n || 0);
    } catch {
      /* */
    }
    return { unreadActivity, pendingFriendRequests };
  });

export const markActivityRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await sql`
        update "friend_activity"
        set "read_at" = current_timestamp
        where "recipient_id" = ${context.userId} and "read_at" is null
      `;
    } catch {
      /* */
    }
    return { ok: true };
  });
