import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";

export type ActivityKind =
  | "completed"
  | "rated"
  | "friend_request"
  | "friend_accept"
  | "list_add"
  | "list_join"
  | "list_vote";

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
    // Batch-load notification prefs: recipients who turned this kind off are
    // skipped (no row = all kinds on).
    const prefsByUser = new Map<string, Record<string, boolean>>();
    if (recipients.length > 0) {
      try {
        const prefRows = await sql<{ user_id: string } & Record<string, boolean>>`
          select "user_id", "completed", "rated", "friend_request", "friend_accept",
            "list_add", "list_join", "list_vote"
          from "notification_prefs"
          where "user_id" = any(${recipients}::text[])
        `;
        for (const r of prefRows) prefsByUser.set(r.user_id, r);
      } catch {
        /* prefs table missing (old DB) — treat everyone as opted in */
      }
    }
    // Everything below is batched. This runs on the user's click (marking a
    // title watched), so it must not fan out to 3 sequential queries per
    // recipient: with 20 friends that was 61 round-trips serialized on a pool
    // of 3, stalling every other query the page had in flight.
    const candidates = recipients.filter(
      (id) => id !== input.actorId && prefsByUser.get(id)?.[input.kind] !== false,
    );
    if (candidates.length === 0) return;

    // One query for every block in either direction (isBlockedBetween was the
    // first of the three per-recipient round-trips).
    let blocked = new Set<string>();
    try {
      const blockRows = await sql<{ other: string }>`
        select "blocked_id" as other from "user_block"
        where "blocker_id" = ${input.actorId}
          and "blocked_id" = any(${candidates}::text[])
        union
        select "blocker_id" as other from "user_block"
        where "blocked_id" = ${input.actorId}
          and "blocker_id" = any(${candidates}::text[])
      `;
      blocked = new Set(blockRows.map((r) => r.other));
    } catch {
      /* user_block missing (old DB) — treat everyone as unblocked */
    }

    // One query for the 2-minute de-duplication window. A failure must not
    // suppress the notification, so it degrades to "no duplicates found".
    let duplicates = new Set<string>();
    try {
      const dupRows = await sql<{ recipient_id: string }>`
        select "recipient_id" from "friend_activity"
        where "actor_id" = ${input.actorId}
          and "kind" = ${input.kind}
          and "recipient_id" = any(${candidates}::text[])
          and coalesce("title", '') = coalesce(${input.title ?? null}, '')
          and "created_at" > (current_timestamp - interval '2 minutes')
      `;
      duplicates = new Set(dupRows.map((r) => r.recipient_id));
    } catch {
      /* ignore */
    }

    const targets = candidates.filter((id) => !blocked.has(id) && !duplicates.has(id));
    if (targets.length === 0) return;

    // Single insert for the whole fan-out.
    const rows = targets.map((recipient_id) => ({ id: newId("act"), recipient_id }));
    await sql`
      insert into "friend_activity" (
        "id", "recipient_id", "actor_id", "kind",
        "title", "anilist_id", "image", "rating"
      )
      select
        x.id, x.recipient_id, ${input.actorId}, ${input.kind},
        ${input.title ?? null}, ${input.anilistId ?? null},
        ${input.image ?? null}, ${input.rating ?? null}
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        as x(id text, recipient_id text)
    `;
  } catch (err) {
    console.error("[activity] fanOut failed", err);
  }
}
