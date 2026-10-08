import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isBlockedBetween } from "@/lib/block-guards";
import {
  lenientObject,
  messageBodyField,
  requiredString,
  z,
  zValidator,
} from "@/lib/validation";
import { isoDateRequired, newId } from "@/lib/ids";

const withUserIdInput = lenientObject({
  withUserId: requiredString("withUserId manquant", 128),
});
const sendToUserInput = lenientObject({
  receiverId: requiredString("Destinataire manquant", 128),
  body: messageBodyField,
});
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
          lastMessageAt: isoDateRequired(row.created_at),
          lastMessageFromMe: row.sender_id === me,
          unreadCount: unreadByOther.get(row.other_id) ?? 0,
        } satisfies ConversationSummary;
      })
      .filter((c): c is ConversationSummary => c !== null)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  });

export type ThreadPage = {
  messages: PrivateMessage[];
  /** True when older messages exist (pass `beforeId` = oldest id to page). */
  hasMore: boolean;
  /** Peer typed within the last 5s. */
  peerTyping: boolean;
};

const threadQueryInput = lenientObject({
  withUserId: requiredString("withUserId manquant", 128),
  beforeId: z.string().max(128).optional(),
  limit: z
    .unknown()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, Number(v) || 50))),
});

/** Thread history, newest page first internally, returned oldest-first. Polled while open. */
export const listThread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zValidator(threadQueryInput))
  .handler(async ({ data, context }): Promise<ThreadPage> => {
    const sql = await getSql();
    const me = context.userId;
    const peer = data.withUserId;
    // Cursor anchor for pagination (created_at + id tiebreak — same-ms sends exist).
    let anchor: { created_at: string | Date; id: string } | null = null;
    if (data.beforeId) {
      const found = await sql<{ created_at: string | Date; id: string }>`
        select "created_at", "id" from "private_message" where "id" = ${data.beforeId} limit 1
      `;
      if (found[0]) anchor = found[0];
    }
    const rows = anchor
      ? await sql<{
          id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string | Date;
          read_at: string | Date | null;
        }>`
          select "id", "sender_id", "receiver_id", "body", "created_at", "read_at"
          from "private_message"
          where (("sender_id" = ${me} and "receiver_id" = ${peer})
             or ("sender_id" = ${peer} and "receiver_id" = ${me}))
            and ("created_at", "id") < (${anchor.created_at}::timestamptz, ${anchor.id})
          order by "created_at" desc, "id" desc
          limit ${data.limit + 1}
        `
      : await sql<{
          id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string | Date;
          read_at: string | Date | null;
        }>`
          select "id", "sender_id", "receiver_id", "body", "created_at", "read_at"
          from "private_message"
          where ("sender_id" = ${me} and "receiver_id" = ${peer})
             or ("sender_id" = ${peer} and "receiver_id" = ${me})
          order by "created_at" desc, "id" desc
          limit ${data.limit + 1}
        `;
    const hasMore = rows.length > data.limit;
    const page = (hasMore ? rows.slice(0, data.limit) : rows).reverse();
    let peerTyping = false;
    try {
      const t = await sql<{ n: string }>`
        select count(*)::text as n from "message_typing"
        where "typer_id" = ${peer} and "with_id" = ${me}
          and "updated_at" > (current_timestamp - interval '5 seconds')
      `;
      peerTyping = Number(t[0]?.n || 0) > 0;
    } catch {
      /* typing table missing (old DB) — just report false */
    }
    return {
      messages: page.map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        receiverId: r.receiver_id,
        body: r.body,
        createdAt: isoDateRequired(r.created_at),
        readAt: r.read_at ? isoDateRequired(r.read_at) : null,
      })),
      hasMore,
      peerTyping,
    };
  });

/** Keystroke heartbeat (client throttles to ~1 per 2.5s while typing). */
export const setTyping = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(withUserIdInput))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.withUserId === context.userId) return { ok: true };
    if (await isBlockedBetween(context.userId, data.withUserId)) {
      throw new Error("Impossible d’envoyer un message à cet utilisateur");
    }
    const sql = await getSql();
    await sql`
      insert into "message_typing" ("typer_id", "with_id", "updated_at")
      values (${context.userId}, ${data.withUserId}, current_timestamp)
      on conflict ("typer_id", "with_id")
      do update set "updated_at" = current_timestamp
    `;
    return { ok: true };
  });

/** Send within an already-open thread (recipient id already known — no username round-trip). */
export const sendMessageToUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(sendToUserInput))
  .handler(async ({ context, data }): Promise<PrivateMessage> => {
    if (data.receiverId === context.userId) throw new Error("Tu ne peux pas t'envoyer un message");
    if (await isBlockedBetween(context.userId, data.receiverId)) {
      throw new Error("Impossible d'envoyer un message à cet utilisateur");
    }
    const sql = await getSql();
    const id = newId("msg");
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
      createdAt: isoDateRequired(rows[0].created_at),
      readAt: null,
    };
  });

/** Mark every message from one contact as read (called on opening/polling a thread). */
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(withUserIdInput))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update "private_message"
      set "read_at" = current_timestamp
      where "receiver_id" = ${context.userId} and "sender_id" = ${data.withUserId} and "read_at" is null
    `;
    return { ok: true };
  });
