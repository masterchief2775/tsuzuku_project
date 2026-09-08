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

function newToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function iso(v: string | Date) {
  return typeof v === "string" ? v : v.toISOString();
}

const ITEM_STATUSES = new Set(["planned", "watching", "watched", "skipped"]);

async function userCanAccess(sql: Awaited<ReturnType<typeof getSql>>, listId: string, userId: string) {
  const rows = await sql<{ role: string }>`
    select m."role" from "shared_list_member" m
    where m."list_id" = ${listId} and m."user_id" = ${userId}
    limit 1
  `;
  return rows[0]?.role ?? null;
}

function canEdit(role: string | null) {
  return role === "owner" || role === "editor";
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

            let list: {
              id: string;
              name: string;
              description: string | null;
              owner_id: string;
              created_at: string | Date;
              updated_at: string | Date;
              invite_token?: string | null;
              invite_enabled?: boolean | null;
            } | undefined;
            try {
              const lists = await sql<{
                id: string;
                name: string;
                description: string | null;
                owner_id: string;
                created_at: string | Date;
                updated_at: string | Date;
                invite_token: string | null;
                invite_enabled: boolean | null;
              }>`
                select "id", "name", "description", "owner_id", "created_at", "updated_at",
                       "invite_token", "invite_enabled"
                from "shared_list" where "id" = ${listId} limit 1
              `;
              list = lists[0];
            } catch {
              const lists = await sql<{
                id: string;
                name: string;
                description: string | null;
                owner_id: string;
                created_at: string | Date;
                updated_at: string | Date;
              }>`
                select "id", "name", "description", "owner_id", "created_at", "updated_at"
                from "shared_list" where "id" = ${listId} limit 1
              `;
              list = lists[0];
            }
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
              order by
                case m."role" when 'owner' then 0 when 'editor' then 1 else 2 end,
                m."joined_at" asc
            `;

            // Items with optional collab columns (fallback if migration pending)
            let items: {
              id: string;
              anilist_id: number;
              title: string;
              image: string | null;
              added_by: string;
              created_at: string | Date;
              display_name: string | null;
              username: string | null;
              status?: string | null;
              notes?: string | null;
              priority?: number | null;
              vote_count?: string | null;
              voted_by_me?: boolean | null;
            }[] = [];

            try {
              items = await sql`
                select
                  i."id", i."anilist_id", i."title", i."image", i."added_by", i."created_at",
                  coalesce(i."status", 'planned') as status,
                  i."notes",
                  coalesce(i."priority", 0) as priority,
                  p."display_name", p."username",
                  (select count(*)::text from "shared_list_vote" v where v."item_id" = i."id") as vote_count,
                  exists(
                    select 1 from "shared_list_vote" v
                    where v."item_id" = i."id" and v."user_id" = ${userId}
                  ) as voted_by_me
                from "shared_list_item" i
                left join "user_profile" p on p."user_id" = i."added_by"
                where i."list_id" = ${listId}
                order by
                  case coalesce(i."status", 'planned')
                    when 'watching' then 0
                    when 'planned' then 1
                    when 'skipped' then 2
                    else 3
                  end,
                  coalesce(i."priority", 0) desc,
                  (
                    select count(*) from "shared_list_vote" v where v."item_id" = i."id"
                  ) desc,
                  i."created_at" desc
              `;
            } catch {
              items = await sql`
                select
                  i."id", i."anilist_id", i."title", i."image", i."added_by", i."created_at",
                  p."display_name", p."username"
                from "shared_list_item" i
                left join "user_profile" p on p."user_id" = i."added_by"
                where i."list_id" = ${listId}
                order by i."created_at" desc
              `;
            }

            return Response.json({
              list: {
                id: list.id,
                name: list.name,
                description: list.description,
                ownerId: list.owner_id,
                createdAt: iso(list.created_at),
                updatedAt: iso(list.updated_at),
                myRole: role,
                inviteEnabled: Boolean(list.invite_enabled),
                inviteToken:
                  role === "owner" && list.invite_enabled ? list.invite_token : null,
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
                status: i.status || "planned",
                notes: i.notes ?? null,
                priority: Number(i.priority || 0),
                voteCount: Number(i.vote_count || 0),
                votedByMe: Boolean(i.voted_by_me),
              })),
            });
          }

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
          if (action === "joinByInvite") {
            const token = String(body.token || "").trim();
            if (!token) return Response.json({ error: "Token manquant" }, { status: 400 });
            const rows = await sql<{ id: string; invite_enabled: boolean }>`
              select "id", "invite_enabled" from "shared_list"
              where "invite_token" = ${token}
              limit 1
            `;
            const list = rows[0];
            if (!list || !list.invite_enabled) {
              return Response.json({ error: "Invitation invalide ou désactivée" }, { status: 404 });
            }
            await sql`
              insert into "shared_list_member" ("list_id", "user_id", "role")
              values (${list.id}, ${userId}, 'editor')
              on conflict ("list_id", "user_id") do nothing
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${list.id}
            `;
            return Response.json({ ok: true, listId: list.id });
          }

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

          if (action === "enableInvite") {
            if (role !== "owner") {
              return Response.json({ error: "Réservé au propriétaire" }, { status: 403 });
            }
            const token = newToken();
            await sql`
              update "shared_list"
              set "invite_token" = ${token}, "invite_enabled" = true, "updated_at" = current_timestamp
              where "id" = ${listId}
            `;
            return Response.json({ ok: true, token });
          }

          if (action === "disableInvite") {
            if (role !== "owner") {
              return Response.json({ error: "Réservé au propriétaire" }, { status: 403 });
            }
            await sql`
              update "shared_list"
              set "invite_enabled" = false, "invite_token" = null, "updated_at" = current_timestamp
              where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          if (action === "addMember") {
            if (role !== "owner") {
              return Response.json({ error: "Réservé au propriétaire" }, { status: 403 });
            }
            const memberId = String(body.userId || "").trim();
            if (!memberId) return Response.json({ error: "userId manquant" }, { status: 400 });
            const memberRole = String(body.role || "editor");
            const safeRole = memberRole === "viewer" ? "viewer" : "editor";
            await sql`
              insert into "shared_list_member" ("list_id", "user_id", "role")
              values (${listId}, ${memberId}, ${safeRole})
              on conflict ("list_id", "user_id") do update set "role" = excluded."role"
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
              return Response.json({ error: "Le propriétaire ne peut pas quitter" }, { status: 400 });
            }
            if (role !== "owner" && memberId !== userId) {
              return Response.json({ error: "Accès refusé" }, { status: 403 });
            }
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
            if (!canEdit(role)) {
              return Response.json({ error: "Lecture seule" }, { status: 403 });
            }
            const title = String(body.title || "").trim().slice(0, 200);
            const anilistId = Number(body.anilistId);
            if (!title || !Number.isFinite(anilistId) || anilistId <= 0) {
              return Response.json({ error: "Titre / anilistId invalide" }, { status: 400 });
            }
            const image = typeof body.image === "string" ? body.image : null;
            const id = newId("sli");
            try {
              await sql`
                insert into "shared_list_item" ("id", "list_id", "anilist_id", "title", "image", "added_by", "status")
                values (${id}, ${listId}, ${anilistId}, ${title}, ${image}, ${userId}, 'planned')
                on conflict ("list_id", "anilist_id") do nothing
              `;
            } catch {
              await sql`
                insert into "shared_list_item" ("id", "list_id", "anilist_id", "title", "image", "added_by")
                values (${id}, ${listId}, ${anilistId}, ${title}, ${image}, ${userId})
                on conflict ("list_id", "anilist_id") do nothing
              `;
            }
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true, id });
          }

          if (action === "addItemsBulk") {
            if (!canEdit(role)) {
              return Response.json({ error: "Lecture seule" }, { status: 403 });
            }
            const raw = Array.isArray(body.items) ? body.items : [];
            let added = 0;
            for (const it of raw.slice(0, 40)) {
              if (!it || typeof it !== "object") continue;
              const o = it as Record<string, unknown>;
              const title = String(o.title || "").trim().slice(0, 200);
              const anilistId = Number(o.anilistId);
              if (!title || !Number.isFinite(anilistId) || anilistId <= 0) continue;
              const image = typeof o.image === "string" ? o.image : null;
              const id = newId("sli");
              try {
                const r = await sql`
                  insert into "shared_list_item" ("id", "list_id", "anilist_id", "title", "image", "added_by", "status")
                  values (${id}, ${listId}, ${anilistId}, ${title}, ${image}, ${userId}, 'planned')
                  on conflict ("list_id", "anilist_id") do nothing
                  returning "id"
                `;
                if (r.length) added += 1;
              } catch {
                try {
                  const r = await sql`
                    insert into "shared_list_item" ("id", "list_id", "anilist_id", "title", "image", "added_by")
                    values (${id}, ${listId}, ${anilistId}, ${title}, ${image}, ${userId})
                    on conflict ("list_id", "anilist_id") do nothing
                    returning "id"
                  `;
                  if (r.length) added += 1;
                } catch {
                  /* skip */
                }
              }
            }
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true, added });
          }

          if (action === "removeItem") {
            if (!canEdit(role)) {
              return Response.json({ error: "Lecture seule" }, { status: 403 });
            }
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

          if (action === "setItemStatus") {
            if (!canEdit(role)) {
              return Response.json({ error: "Lecture seule" }, { status: 403 });
            }
            const itemId = String(body.itemId || "").trim();
            const status = String(body.status || "").trim();
            if (!itemId || !ITEM_STATUSES.has(status)) {
              return Response.json({ error: "Statut invalide" }, { status: 400 });
            }
            await sql`
              update "shared_list_item"
              set "status" = ${status}
              where "id" = ${itemId} and "list_id" = ${listId}
            `;
            await sql`
              update "shared_list" set "updated_at" = current_timestamp where "id" = ${listId}
            `;
            return Response.json({ ok: true });
          }

          if (action === "toggleVote") {
            const itemId = String(body.itemId || "").trim();
            if (!itemId) return Response.json({ error: "itemId manquant" }, { status: 400 });
            const exists = await sql<{ item_id: string }>`
              select "item_id" from "shared_list_vote"
              where "item_id" = ${itemId} and "user_id" = ${userId}
              limit 1
            `;
            if (exists[0]) {
              await sql`
                delete from "shared_list_vote"
                where "item_id" = ${itemId} and "user_id" = ${userId}
              `;
            } else {
              await sql`
                insert into "shared_list_vote" ("item_id", "list_id", "user_id")
                values (${itemId}, ${listId}, ${userId})
                on conflict do nothing
              `;
            }
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
