import { getSql } from "@/lib/db";
import { isBlockedBetween } from "@/lib/blocks.server";

export type ActivityKind =
  | "completed"
  | "rated"
  | "friend_request"
  | "friend_accept";

function newId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

export async function fanOutToFriends(input: {
  actorId: string;
  kind: ActivityKind;
  title?: string | null;
  anilistId?: number | null;
  image?: string | null;
  rating?: number | null;
  onlyRecipientId?: string;
}): Promise<void> {
  try {
    const sql = await getSql();
    const recipients = input.onlyRecipientId
      ? [input.onlyRecipientId]
      : await friendIdsOf(input.actorId);
    for (const recipientId of recipients) {
      if (recipientId === input.actorId) continue;
      if (await isBlockedBetween(input.actorId, recipientId)) continue;
      const id = newId();
      await sql`
        insert into "friend_activity" (
          "id", "recipient_id", "actor_id", "kind",
          "title", "anilist_id", "image", "rating"
        ) values (
          ${id}, ${recipientId}, ${input.actorId}, ${input.kind},
          ${input.title ?? null}, ${input.anilistId ?? null},
          ${input.image ?? null}, ${input.rating ?? null}
        )
      `;
    }
  } catch (err) {
    console.error("[activity] fanOut failed", err);
  }
}
