import { createFileRoute } from "@tanstack/react-router";
import { auth, authConfigured } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

async function requireUserId(request: Request): Promise<string | Response> {
  if (!authConfigured) {
    return Response.json({ error: "Auth disabled" }, { status: 503 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return id;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function iso(v: string | Date) {
  return typeof v === "string" ? v : v.toISOString();
}

async function userCanAccess(sql: Awaited<ReturnType<typeof getSql>>, listId: string, userId: string) {
  const rows = await sql<{ role: string }>`
    select m."role" from "shared_list_member" m
    where m."list_id" = ${listId} and m."user_id" = ${userId}
    limit 1
  `;
  return rows[0]?.role ?? null;
}

export const Route = createFileRoute("/api/shared-lists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userIdOrRes = await requireUserId(request);
        if (userIdOrRes instanceof Response) return userIdOrRes;
        const userId = userIdOrRes;
        const url = new URL(request.url);
        const listId = url.searchParams.get("id")?.trim();
        const sql = await getSql();

        try {
          if (listId) {
            const role = await userCanAccess(sql, listId, userId);
            if (!role) return Response.json({ error: "Liste introuvable" }, { status: 404 });

            const lists = await sql<{
              id: string;
              name: string;
              description: string | null;
              owner_id: string;
              created_at: string | Date;
              updated_at: string | Date;
            }>`
              select * from "shared_list" where "id" = ${listId} limit 1
            `;
            const list = lists[0];
            if (!list) return Response.json({ error: "Liste introuvable" }, { status: 404 });

            const members = await sql<{
              user_id: string;
              role: string;
              joined_at: string | Date;
              display_name: string | null;
              username: string | null;
              avatar_url: string | null;
              name: string | null;
              user_image: string | null;
            }>`
              select
                m."user_id", m."role", m."joined_at",
                p."display_name", p."username", p."avatar_url",
                u."name", u."image" as user_image
              from "shared_list_member" m
              join "user" u on u."id" = m."user_id"
              left join "user_profile" p on p."user_id" = m."user_id"
              where m."list_id" = ${listId}
              order by m."role" desc, m."joined_at" asc
            `;

            const items = await sql<{
              id: string;
              anilist_id: number;
              title: string;
              image: string | null;
              added_by: string;
              created_at: string | Date;
              display_name: string | null;
              username: string | null;
            }>`
              select
                i."id", i."anilist_id", i."title", i."image", i."added_by", i."created_at",
                p."display_name", p."username"
              from "shared_list_item" i
              left join "user_profile" p on p."user_id" = i."added_by"
              where i."list_id" = ${listId}
              order by i."created_at" desc
            `;

            return Response.json({
              list: {
                id: list.id,
                name: list.name,
                description: list.description,
                ownerId: list.owner_id,
                createdAt: iso(list.created_at),
                updatedAt: iso(list.updated_at),
                myRole: role,
              },
              members: members.map((m) => ({
                userId: m.user_id,
                role: m.role,
                joinedAt: iso(m.joined_at),
                displayName: m.display_name || m.name || m.username || "Membre",
                username: m.username || "user",
                avatarUrl: m.avatar_url || m.user_image || null,
              })),
              items: items.map((i) => ({
                id: i.id,
                anilistId: i.anilist_id,
                title: i.title,
                image: i.image,
                addedBy: i.added_by,
                addedByName: i.display_name || i.username || "Membre",
                createdAt: iso(i.created_at),
              })),
            });
          }

          // My lists (member of)
          const rows = await sql<{
            id: string;
            name: string;
            description: string | null;
            owner_id: string;
            updated_at: string | Date;
            role: string;
            item_count: string;
            member_count: string;
          }>`
            select
              l."id", l."name", l."description", l."owner_id", l."updated_at",
              m."role",
              (select count(*)::text from "shared_list_item" i where i."list_id" = l."id") as item_count,
              (select count(*)::text from "shared_list_member" mm where mm."list_id" = l."id") as member_count
            from "shared_list" l
            join "shared_list_member" m on m."list_id" = l."id" and m."user_id" = ${userId}
            order by l."updated_at" desc
            limit 100
          `;

          return Response.json({
            lists: rows.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              ownerId: r.owner_id,
              updatedAt: iso(r.updated_at),
              myRole: r.role,
              itemCount: Number(r.item_count || 0),
              memberCount: Number(r.member_count || 0),
            })),
          });
        } catch (err) {
          console.error("[shared-lists] GET", err);
          return Response.json({ error: "Erreur serveur" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const userIdOrRes = await requireUserId(request);
        if (userIdOrRes instanceof Response) return userIdOrRes;
        const userId = userIdOrRes;
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "JSON invalide" }, { status: 400 });
        }
        const action = String(body.action || "");
        const sql = await getSql();

        try {
          if (action === "create") {
            const name = String(body.name || "").trim().slice(0, 80);
            if (name.length < 2) {
              return Response.json({ error: "Nom trop court" }, { status: 400 });
            }
            const description = String(body.description || "").trim().slice(0, 300) || null;
            const id = newId("sl");
            await sql`
              insert into "shared_list" ("id", "name", "description", "owner_id")
              values (${id}, ${name}, ${description}, ${userId})
            `;
            await sql`
              insert into "shared_list_member" ("list_id", "user_id", "role")
              values (${id}, ${userId}, 'owner')
            `;
            return Response.json({ ok: true, id });
          }

          const listId = String(body.listId || "").trim();
          if (!listId) return Response.json({ error: "listId manquant" }, { status: 400 });
          const role = await userCanAccess(sql, listId, userId);
          if (!role) return Response.json({ error: "Accès refusé" }, { status: 403 });

          if (action === "rename") {
            if (role !== "owner") {
              return Response.json({ error: "Réservé au propriétaire" }, { status: 403 });
            }
            const name = String(body.name || "").trim().slice(0, 80);
            if (name.length < 2) {
              return Response.json({ error: "Nom trop court" }, { status: 400 });
            }
            const description = String(body.description || "").trim().slice(0, 300) || null;
            await sql`
              update "shared_list"
              set "name" = ${name}, "description" = ${description}, "updated_at" = current_timestamp
              where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          if (action === "delete") {
            if (role !== "owner") {
              return Response.json({ error: "Réservé au propriétaire" }, { status: 403 });
            }
            await sql`delete from "shared_list" where "id" = ${listId}`;
            return Response.json({ ok: true });
          }

          if (action === "addMember") {
            const memberId = String(body.userId || "").trim();
            if (!memberId) return Response.json({ error: "userId manquant" }, { status: 400 });
            // Must be accepted friends
            const fr = await sql<{ n: string }>`
              select count(*)::text as n from "friendship"
              where "status" = 'accepted'
                and (
                  ("requester_id" = ${userId} and "addressee_id" = ${memberId})
                  or ("requester_id" = ${memberId} and "addressee_id" = ${userId})
                )
            `;
            if (Number(fr[0]?.n || 0) === 0) {
              return Response.json({ error: "Uniquement des amis acceptés" }, { status: 400 });
            }
            await sql`
              insert into "shared_list_member" ("list_id", "user_id", "role")
              values (${listId}, ${memberId}, 'editor')
              on conflict ("list_id", "user_id") do nothing
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          if (action === "removeMember") {
            const memberId = String(body.userId || "").trim();
            if (!memberId) return Response.json({ error: "userId manquant" }, { status: 400 });
            if (memberId === userId && role === "owner") {
              return Response.json({ error: "Le propriétaire ne peut pas se retirer" }, { status: 400 });
            }
            if (role !== "owner" && memberId !== userId) {
              return Response.json({ error: "Accès refusé" }, { status: 403 });
            }
            // cannot remove owner
            const target = await sql<{ role: string }>`
              select "role" from "shared_list_member"
              where "list_id" = ${listId} and "user_id" = ${memberId}
            `;
            if (target[0]?.role === "owner") {
              return Response.json({ error: "Impossible de retirer le propriétaire" }, { status: 400 });
            }
            await sql`
              delete from "shared_list_member"
              where "list_id" = ${listId} and "user_id" = ${memberId}
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          if (action === "addItem") {
            const title = String(body.title || "").trim().slice(0, 200);
            const anilistId = Number(body.anilistId);
            if (!title || !Number.isFinite(anilistId) || anilistId <= 0) {
              return Response.json({ error: "Titre / anilistId invalide" }, { status: 400 });
            }
            const image = typeof body.image === "string" ? body.image : null;
            const id = newId("sli");
            await sql`
              insert into "shared_list_item" ("id", "list_id", "anilist_id", "title", "image", "added_by")
              values (${id}, ${listId}, ${anilistId}, ${title}, ${image}, ${userId})
              on conflict ("list_id", "anilist_id") do nothing
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true, id });
          }

          if (action === "removeItem") {
            const itemId = String(body.itemId || "").trim();
            if (!itemId) return Response.json({ error: "itemId manquant" }, { status: 400 });
            await sql`
              delete from "shared_list_item"
              where "id" = ${itemId} and "list_id" = ${listId}
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          return Response.json({ error: "Action inconnue" }, { status: 400 });
        } catch (err) {
          console.error("[shared-lists] POST", err);
          return Response.json({ error: "Erreur serveur" }, { status: 500 });
        }
      },
    },
  },
});
