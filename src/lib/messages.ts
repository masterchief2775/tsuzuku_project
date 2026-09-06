import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isBlockedBetween } from "@/lib/block-guards";

export type PrivateMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type ConversationSummary = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFromMe: boolean;
  unreadCount: number;
};

function messageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function iso(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

async function resolveUserId(username: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select "user_id" from "user_profile" where lower("username") = lower(${username}) limit 1
  `;
  return rows[0]?.user_id ?? null;
}

/** One row per contact you've exchanged messages with, most recent first — the inbox landing view. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const me = context.userId;
    const sql = await getSql();

    const last = await sql<{
      other_id: string;
      body: string;
      created_at: string | Date;
      sender_id: string;
    }>`
      select distinct on (other_id) other_id, body, created_at, sender_id
      from (
        select
          case when "sender_id" = ${me} then "receiver_id" else "sender_id" end as other_id,
          "body", "created_at", "sender_id"
        from "private_message"
        where "sender_id" = ${me} or "receiver_id" = ${me}
      ) t
      order by other_id, created_at desc
    `;
    if (last.length === 0) return [];

    const unread = await sql<{ sender_id: string; n: number }>`
      select "sender_id", count(*)::int as n
      from "private_message"
      where "receiver_id" = ${me} and "read_at" is null
      group by "sender_id"
    `;
    const unreadByOther = new Map(unread.map((r) => [r.sender_id, r.n]));

    const otherIds = last.map((r) => r.other_id);
    const profiles = await sql<{
      user_id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      name: string | null;
      image: string | null;
    }>`
      select p."user_id", p."username", p."display_name", p."avatar_url", u."name", u."image"
      from "user_profile" p
      join "user" u on u."id" = p."user_id"
      where p."user_id" = any(${otherIds}::text[])
    `;
    const profileById = new Map(profiles.map((p) => [p.user_id, p]));

    return last
      .map((row) => {
        const profile = profileById.get(row.other_id);
        if (!profile) return null;
        return {
          userId: row.other_id,
          username: profile.username,
          displayName: profile.display_name || profile.name || profile.username,
          avatarUrl: profile.avatar_url || profile.image || null,
          lastMessage: row.body,
          lastMessageAt: iso(row.created_at),
          lastMessageFromMe: row.sender_id === me,
          unreadCount: unreadByOther.get(row.other_id) ?? 0,
        } satisfies ConversationSummary;
      })
      .filter((c): c is ConversationSummary => c !== null)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  });

/** Total unread count across all conversations — for the nav badge. Cheap: one aggregate query. */
export const getUnreadMessageCount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<number> => {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from "private_message"
      where "receiver_id" = ${context.userId} and "read_at" is null
    `;
    return rows[0]?.n ?? 0;
  });

/** Full history with one contact, oldest first. Polled while a thread is open. */
export const listThread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const withUserId = (input as { withUserId?: string } | null)?.withUserId?.trim();
    if (!withUserId) throw new Error("withUserId manquant");
    return { withUserId };
  })
  .handler(async ({ data, context }): Promise<PrivateMessage[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      sender_id: string;
      receiver_id: string;
      body: string;
      created_at: string | Date;
      read_at: string | Date | null;
    }>`
      select "id", "sender_id", "receiver_id", "body", "created_at", "read_at"
      from "private_message"
      where ("sender_id" = ${context.userId} and "receiver_id" = ${data.withUserId})
         or ("sender_id" = ${data.withUserId} and "receiver_id" = ${context.userId})
      order by "created_at" asc
      limit 300
    `;
    return rows.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      body: r.body,
      createdAt: iso(r.created_at),
      readAt: r.read_at ? iso(r.read_at) : null,
    }));
  });

/** Send within an already-open thread (recipient id already known — no username round-trip). */
export const sendMessageToUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const value = input as { receiverId?: string; body?: string } | null;
    const receiverId = value?.receiverId?.trim() ?? "";
    const body = value?.body?.trim() ?? "";
    if (!receiverId) throw new Error("Destinataire manquant");
    if (!body) throw new Error("Le message ne peut pas être vide");
    if (body.length > 2000) throw new Error("Le message est trop long");
    return { receiverId, body };
  })
  .handler(async ({ context, data }): Promise<PrivateMessage> => {
    if (data.receiverId === context.userId) throw new Error("Tu ne peux pas t'envoyer un message");
    if (await isBlockedBetween(context.userId, data.receiverId)) {
      throw new Error("Impossible d'envoyer un message à cet utilisateur");
    }
    const sql = await getSql();
    const id = messageId();
    const rows = await sql<{ created_at: string | Date }>`
      insert into "private_message" ("id", "sender_id", "receiver_id", "body")
      values (${id}, ${context.userId}, ${data.receiverId}, ${data.body})
      returning "created_at"
    `;
    return {
      id,
      senderId: context.userId,
      receiverId: data.receiverId,
      body: data.body,
      createdAt: iso(rows[0].created_at),
      readAt: null,
    };
  });

/** Start (or continue) a conversation by username — used from the "new message" search box. */
export const sendPrivateMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const value = input as { username?: string; body?: string } | null;
    const username = value?.username?.trim().toLowerCase() ?? "";
    const body = value?.body?.trim() ?? "";
    if (!username) throw new Error("Pseudo du destinataire requis");
    if (!body) throw new Error("Le message ne peut pas être vide");
    if (body.length > 2000) throw new Error("Le message est trop long");
    return { username, body };
  })
  .handler(async ({ context, data }): Promise<{ receiverId: string }> => {
    const receiverId = await resolveUserId(data.username);
    if (!receiverId) throw new Error("Utilisateur introuvable");
    if (receiverId === context.userId) throw new Error("Tu ne peux pas t'envoyer un message");
    if (await isBlockedBetween(context.userId, receiverId)) {
      throw new Error("Impossible d'envoyer un message à cet utilisateur");
    }
    const sql = await getSql();
    await sql`
      insert into "private_message" ("id", "sender_id", "receiver_id", "body")
      values (${messageId()}, ${context.userId}, ${receiverId}, ${data.body})
    `;
    return { receiverId };
  });

/** Mark every message from one contact as read (called on opening/polling a thread). */
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const withUserId = (input as { withUserId?: string } | null)?.withUserId?.trim();
    if (!withUserId) throw new Error("withUserId manquant");
    return { withUserId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update "private_message"
      set "read_at" = current_timestamp
      where "receiver_id" = ${context.userId} and "sender_id" = ${data.withUserId} and "read_at" is null
    `;
    return { ok: true };
  });
