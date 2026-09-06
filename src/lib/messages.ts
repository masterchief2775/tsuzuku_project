import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isBlockedBetween } from "@/lib/blocks.server";

export type PrivateMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  receiverId: string;
  receiverName: string;
  receiverUsername: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function messageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function iso(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

export const listPrivateMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PrivateMessage[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      sender_id: string;
      sender_name: string | null;
      sender_username: string | null;
      receiver_id: string;
      receiver_name: string | null;
      receiver_username: string | null;
      body: string;
      created_at: string | Date;
      read_at: string | Date | null;
    }>`
      select
        m."id", m."sender_id", m."receiver_id", m."body", m."created_at", m."read_at",
        su."name" as sender_name, sp."username" as sender_username,
        ru."name" as receiver_name, rp."username" as receiver_username
      from "private_message" m
      join "user" su on su."id" = m."sender_id"
      left join "user_profile" sp on sp."user_id" = m."sender_id"
      join "user" ru on ru."id" = m."receiver_id"
      left join "user_profile" rp on rp."user_id" = m."receiver_id"
      where m."sender_id" = ${context.userId} or m."receiver_id" = ${context.userId}
      order by m."created_at" desc
      limit 100
    `;
    return rows.map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name || row.sender_username || "Utilisateur",
      senderUsername: row.sender_username || "user",
      receiverId: row.receiver_id,
      receiverName: row.receiver_name || row.receiver_username || "Utilisateur",
      receiverUsername: row.receiver_username || "user",
      body: row.body,
      createdAt: iso(row.created_at),
      readAt: row.read_at ? iso(row.read_at) : null,
    }));
  });

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
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const users = await sql<{ user_id: string }>`
      select "user_id" from "user_profile"
      where lower("username") = lower(${data.username})
      limit 1
    `;
    const receiverId = users[0]?.user_id;
    if (!receiverId) throw new Error("Utilisateur introuvable");
    if (receiverId === context.userId) throw new Error("Tu ne peux pas t’envoyer un message");
    if (await isBlockedBetween(context.userId, receiverId)) {
      throw new Error("Impossible d’envoyer un message à cet utilisateur");
    }

    await sql`
      insert into "private_message" ("id", "sender_id", "receiver_id", "body")
      values (${messageId()}, ${context.userId}, ${receiverId}, ${data.body})
    `;
    return { ok: true };
  });

export const markPrivateMessagesRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update "private_message"
      set "read_at" = current_timestamp
      where "receiver_id" = ${context.userId} and "read_at" is null
    `;
    return { ok: true };
  });
