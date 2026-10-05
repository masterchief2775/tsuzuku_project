import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser } from "@/lib/auth/api-guard.server";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userIdOrRes = await requireApiUser(request);
        if (userIdOrRes instanceof Response) return userIdOrRes;
        const userId = userIdOrRes;
        const url = new URL(request.url);
        const sql = await getSql();

        if (url.searchParams.get("counts") === "1") {
          // Single round-trip badge: activity + friend requests + unread
          // messages. Lets the header/nav share ONE 60s poller instead of
          // three separate ones (was: badge 30s + message count 15s × 2 mounts).
          let unreadActivity = 0;
          let pendingFriendRequests = 0;
          let unreadMessages = 0;
          try {
            const rows = await sql<{ unread_activity: string; pending_requests: string; unread_messages: string }>`
              select
                (select count(*)::text from "friend_activity"
                  where "recipient_id" = ${userId} and "read_at" is null) as unread_activity,
                (select count(*)::text from "friendship"
                  where "addressee_id" = ${userId} and "status" = 'pending') as pending_requests,
                (select count(*)::text from "private_message"
                  where "receiver_id" = ${userId} and "read_at" is null) as unread_messages
            `;
            unreadActivity = Number(rows[0]?.unread_activity || 0);
            pendingFriendRequests = Number(rows[0]?.pending_requests || 0);
            unreadMessages = Number(rows[0]?.unread_messages || 0);
          } catch { /* */ }
          return Response.json({ unreadActivity, pendingFriendRequests, unreadMessages });
        }

        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
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
            where a."recipient_id" = ${userId}
            order by a."created_at" desc
            limit ${limit}
          `;
          const items = rows.map((r) => ({
            id: r.id,
            actorId: r.actor_id,
            actorName: r.display_name || r.name || r.username || "Ami",
            actorUsername: r.username || "user",
            actorAvatar: r.avatar_url || r.user_image || null,
            kind: r.kind,
            title: r.title,
            anilistId: r.anilist_id,
            image: r.image,
            rating: r.rating,
            createdAt:
              typeof r.created_at === "string"
                ? r.created_at
                : r.created_at.toISOString(),
            readAt: r.read_at
              ? typeof r.read_at === "string"
                ? r.read_at
                : r.read_at.toISOString()
              : null,
          }));
          return Response.json({ items });
        } catch {
          return Response.json({ items: [] });
        }
      },

      POST: async ({ request }) => {
        const userIdOrRes = await requireApiUser(request);
        if (userIdOrRes instanceof Response) return userIdOrRes;
        const userId = userIdOrRes;
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "JSON invalide" }, { status: 400 });
        }

        const action = String(body.action || "");

        if (action === "markRead") {
          const sql = await getSql();
          try {
            await sql`
              update "friend_activity"
              set "read_at" = current_timestamp
              where "recipient_id" = ${userId} and "read_at" is null
            `;
          } catch {
            /* */
          }
          return Response.json({ ok: true });
        }

        if (action === "publish") {
          const kind = body.kind;
          if (kind !== "completed" && kind !== "rated") {
            return Response.json({ error: "Type invalide" }, { status: 400 });
          }
          const title = String(body.title || "").trim().slice(0, 200);
          if (!title) return Response.json({ error: "Titre manquant" }, { status: 400 });
          const anilistId = Number(body.anilistId);
          const { fanOutToFriends } = await import("@/lib/activity-fanout.server");
          await fanOutToFriends({
            actorId: userId,
            kind,
            title,
            anilistId: Number.isFinite(anilistId) && anilistId > 0 ? anilistId : null,
            image: typeof body.image === "string" ? body.image : null,
            rating:
              typeof body.rating === "number" && body.rating >= 0 && body.rating <= 10
                ? body.rating
                : null,
          });
          return Response.json({ ok: true });
        }

        return Response.json({ error: "Action inconnue" }, { status: 400 });
      },
    },
  },
});
