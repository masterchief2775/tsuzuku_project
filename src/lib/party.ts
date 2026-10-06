import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isBlockedBetween } from "@/lib/blocks.server";
import { lenientObject, requiredString, z, zValidator } from "@/lib/validation";

export type PartyMemberStatus = "ready" | "paused" | "done";

export type PartyMember = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  status: PartyMemberStatus;
  progress: number;
  isHost: boolean;
};

export type PartyMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

export type PartyDetail = {
  roomId: string;
  title: string;
  anilistId: number | null;
  image: string | null;
  episode: number;
  isHost: boolean;
  myStatus: PartyMemberStatus;
  inviteToken: string;
  members: PartyMember[];
  messages: PartyMessage[];
};

const MAX_OPEN_ROOMS_PER_HOST = 5;

function roomId() {
  return `room_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}
function messageId() {
  return `pmsg_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}
function newToken() {
  return `pty_${randomBytes(18).toString("base64url")}`;
}
function iso(v: string | Date) {
  return typeof v === "string" ? v : v.toISOString();
}

type RoomRow = {
  id: string;
  host_id: string;
  title: string;
  anilist_id: number | null;
  image: string | null;
  episode: number;
  status: string;
  invite_token: string;
};

async function areFriends(a: string, b: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select "id" from "friendship"
    where "status" = 'accepted'
      and (("requester_id" = ${a} and "addressee_id" = ${b})
        or ("requester_id" = ${b} and "addressee_id" = ${a}))
    limit 1
  `;
  return rows.length > 0;
}

async function requireOpenRoom(roomId: string) {
  const sql = await getSql();
  const rows = await sql<RoomRow>`
    select "id", "host_id", "title", "anilist_id", "image", "episode", "status", "invite_token"
    from "party_room" where "id" = ${roomId} limit 1
  `;
  const room = rows[0];
  if (!room) throw new Error("Session introuvable");
  if (room.status !== "open") throw new Error("Session terminée");
  return room;
}

async function requireMember(roomId: string, userId: string) {
  const sql = await getSql();
  const rows = await sql<{ status: PartyMemberStatus }>`
    select "status" from "party_member"
    where "room_id" = ${roomId} and "user_id" = ${userId} limit 1
  `;
  if (!rows[0]) throw new Error("Tu ne participes pas à cette session");
  return rows[0];
}

const createPartyInput = lenientObject({
  title: requiredString("Titre manquant", 200),
  anilistId: z.preprocess(
    (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    },
    z.number().nullable(),
  ),
  image: z.preprocess((v) => (typeof v === "string" ? v : null), z.string().nullable()),
  episode: z.preprocess(
    (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(10000, Math.max(1, Math.floor(n))) : 1;
    },
    z.number().min(1).max(10000),
  ),
});

/** Open a room as host (auto-joined as ready). */
export const createParty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(createPartyInput))
  .handler(async ({ context, data }): Promise<{ roomId: string; token: string }> => {
    const sql = await getSql();
    const open = await sql<{ n: string }>`
      select count(*)::text as n from "party_room"
      where "host_id" = ${context.userId} and "status" = 'open'
    `;
    if (Number(open[0]?.n || 0) >= MAX_OPEN_ROOMS_PER_HOST) {
      throw new Error("Tu as déjà 5 sessions ouvertes — ferme-en une d’abord");
    }
    const id = roomId();
    const token = newToken();
    await sql`
      insert into "party_room" ("id", "host_id", "title", "anilist_id", "image", "episode", "invite_token")
      values (${id}, ${context.userId}, ${data.title}, ${data.anilistId}, ${data.image}, ${data.episode}, ${token})
    `;
    await sql`
      insert into "party_member" ("room_id", "user_id", "status")
      values (${id}, ${context.userId}, 'ready')
    `;
    return { roomId: id, token };
  });

/** Join via invite token — host's friends only, never across a block. */
export const joinPartyByToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(lenientObject({ token: requiredString("Invitation invalide", 128) })))
  .handler(async ({ context, data }): Promise<{ roomId: string }> => {
    const sql = await getSql();
    const rows = await sql<RoomRow>`
      select "id", "host_id", "title", "anilist_id", "image", "episode", "status", "invite_token"
      from "party_room" where "invite_token" = ${data.token} limit 1
    `;
    const room = rows[0];
    if (!room) throw new Error("Invitation invalide");
    if (room.status !== "open") throw new Error("Session terminée");
    if (room.host_id !== context.userId) {
      if (await isBlockedBetween(context.userId, room.host_id)) {
        throw new Error("Impossible de rejoindre cette session");
      }
      if (!(await areFriends(context.userId, room.host_id))) {
        throw new Error("Seuls les amis de l’hôte peuvent rejoindre");
      }
    }
    await sql`
      insert into "party_member" ("room_id", "user_id", "status")
      values (${room.id}, ${context.userId}, 'ready')
      on conflict ("room_id", "user_id") do nothing
    `;
    return { roomId: room.id };
  });

export type PartySummary = {
  roomId: string;
  title: string;
  episode: number;
  isHost: boolean;
  memberCount: number;
};

/** Open rooms I'm in — drives the global session badge (cheap, no messages). */
export const getMyParties = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PartySummary[]> => {
    const sql = await getSql();
    const rows = await sql<{
      room_id: string;
      title: string;
      episode: number;
      host_id: string;
      member_count: number;
    }>`
      select r."id" as room_id, r."title", r."episode", r."host_id",
        (select count(*)::int from "party_member" m where m."room_id" = r."id") as member_count
      from "party_room" r
      join "party_member" me on me."room_id" = r."id" and me."user_id" = ${context.userId}
      where r."status" = 'open'
      order by r."created_at" desc
    `;
    return rows.map((r) => ({
      roomId: r.room_id,
      title: r.title,
      episode: r.episode,
      isHost: r.host_id === context.userId,
      memberCount: r.member_count,
    }));
  });

/** Full room state for members (4s visible poll). */
export const getParty = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zValidator(lenientObject({ roomId: requiredString("Session manquante", 128) })))
  .handler(async ({ context, data }): Promise<PartyDetail> => {
    const sql = await getSql();
    // All four depend only on (roomId, userId), so they run concurrently
    // instead of one after another: this handler is on a 4s poll, which meant
    // 4x the latency for every member's session. A failing check still
    // rejects the whole handler, exactly as before.
    const [room, myRow, members, messages] = await Promise.all([
      requireOpenRoom(data.roomId),
      requireMember(data.roomId, context.userId),
      sql<{
        user_id: string;
        status: PartyMemberStatus;
        progress: number;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
        name: string | null;
        image: string | null;
      }>`
        select m."user_id", m."status", m."progress",
          p."display_name", p."username", p."avatar_url",
          u."name", u."image"
        from "party_member" m
        join "user" u on u."id" = m."user_id"
        left join "user_profile" p on p."user_id" = m."user_id"
        where m."room_id" = ${data.roomId}
        order by m."joined_at" asc
      `,
      sql<{
        id: string;
        sender_id: string;
        body: string;
        created_at: string | Date;
        display_name: string | null;
        username: string | null;
        name: string | null;
      }>`
        select g."id", g."sender_id", g."body", g."created_at",
          p."display_name", p."username", u."name"
        from "party_message" g
        join "user" u on u."id" = g."sender_id"
        left join "user_profile" p on p."user_id" = g."sender_id"
        where g."room_id" = ${data.roomId}
        order by g."created_at" asc
        limit 50
      `,
    ]);
    return {
      roomId: room.id,
      title: room.title,
      anilistId: room.anilist_id,
      image: room.image,
      episode: room.episode,
      isHost: room.host_id === context.userId,
      myStatus: myRow.status,
      inviteToken: room.invite_token,
      members: members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name || m.name || m.username || "Ami",
        username: m.username || "user",
        avatarUrl: m.avatar_url || m.image || null,
        status: m.status,
        progress: m.progress,
        isHost: m.user_id === room.host_id,
      })),
      messages: messages.map((g) => ({
        id: g.id,
        senderId: g.sender_id,
        senderName: g.display_name || g.name || g.username || "Ami",
        body: g.body,
        createdAt: iso(g.created_at),
      })),
    };
  });

/** Member readiness: ready | paused | done. */
export const setPartyStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zValidator(
      lenientObject({
        roomId: requiredString("Session manquante", 128),
        status: z.enum(["ready", "paused", "done"], { message: "Statut invalide" }),
      }),
    ),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireOpenRoom(data.roomId);
    await requireMember(data.roomId, context.userId);
    const sql = await getSql();
    await sql`
      update "party_member" set "status" = ${data.status}
      where "room_id" = ${data.roomId} and "user_id" = ${context.userId}
    `;
    return { ok: true };
  });

/** Shared episode cursor — host only. */
export const setPartyEpisode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zValidator(
      lenientObject({
        roomId: requiredString("Session manquante", 128),
        episode: z.preprocess(
          (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.min(10000, Math.max(1, Math.floor(n))) : NaN;
          },
          z.number().min(1, "Épisode invalide").max(10000),
        ),
      }),
    ),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; episode: number }> => {
    const room = await requireOpenRoom(data.roomId);
    if (room.host_id !== context.userId) throw new Error("Seul l’hôte pilote l’épisode");
    const sql = await getSql();
    await sql`update "party_room" set "episode" = ${data.episode} where "id" = ${data.roomId}`;
    return { ok: true, episode: data.episode };
  });

/** Ephemeral chat (deleted on close). */
export const postPartyMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zValidator(
      lenientObject({
        roomId: requiredString("Session manquante", 128),
        body: requiredString("Le message ne peut pas être vide", 1000),
      }),
    ),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    await requireOpenRoom(data.roomId);
    await requireMember(data.roomId, context.userId);
    const sql = await getSql();
    const id = messageId();
    await sql`
      insert into "party_message" ("id", "room_id", "sender_id", "body")
      values (${id}, ${data.roomId}, ${context.userId}, ${data.body})
    `;
    return { ok: true, id };
  });

/** Leave (host leaving closes the room for everyone). */
export const leaveParty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(lenientObject({ roomId: requiredString("Session manquante", 128) })))
  .handler(async ({ context, data }): Promise<{ ok: true; closed: boolean }> => {
    const sql = await getSql();
    const rows = await sql<{ host_id: string }>`
      select "host_id" from "party_room" where "id" = ${data.roomId} limit 1
    `;
    if (!rows[0]) return { ok: true, closed: true };
    if (rows[0].host_id === context.userId) {
      await sql`delete from "party_message" where "room_id" = ${data.roomId}`;
      await sql`delete from "party_member" where "room_id" = ${data.roomId}`;
      await sql`delete from "party_room" where "id" = ${data.roomId}`;
      return { ok: true, closed: true };
    }
    await sql`
      delete from "party_member" where "room_id" = ${data.roomId} and "user_id" = ${context.userId}
    `;
    return { ok: true, closed: false };
  });

/** Host closes: chat + membership wiped (ephemeral sessions). */
export const closeParty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(lenientObject({ roomId: requiredString("Session manquante", 128) })))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ host_id: string }>`
      select "host_id" from "party_room" where "id" = ${data.roomId} limit 1
    `;
    if (!rows[0]) return { ok: true };
    if (rows[0].host_id !== context.userId) throw new Error("Seul l’hôte peut fermer la session");
    await sql`delete from "party_message" where "room_id" = ${data.roomId}`;
    await sql`delete from "party_member" where "room_id" = ${data.roomId}`;
    await sql`delete from "party_room" where "id" = ${data.roomId}`;
    return { ok: true };
  });
