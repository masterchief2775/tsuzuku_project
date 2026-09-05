import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { mapRow, type ProfileRow, type PublicProfile } from "@/lib/profile";

export type BlockedUser = PublicProfile & { blockedAt: string };

function newId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function iso(v: string | Date) {
  return typeof v === "string" ? v : v.toISOString();
}

/** True if either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const sql = await getSql();
  try {
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from "user_block"
      where
        ("blocker_id" = ${a} and "blocked_id" = ${b})
        or ("blocker_id" = ${b} and "blocked_id" = ${a})
    `;
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    // Table may not exist yet on old deploys
    return false;
  }
}

/** True if `blocker` has blocked `blocked`. */
export async function hasBlocked(blocker: string, blocked: string): Promise<boolean> {
  if (!blocker || !blocked || blocker === blocked) return false;
  const sql = await getSql();
  try {
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from "user_block"
      where "blocker_id" = ${blocker} and "blocked_id" = ${blocked}
    `;
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const userId = (input as { userId?: string } | null)?.userId?.trim();
    if (!userId) throw new Error("Utilisateur manquant");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const me = context.userId;
    if (data.userId === me) throw new Error("Tu ne peux pas te bloquer toi-même");
    const sql = await getSql();

    const exists = await sql<{ id: string }>`
      select "id" from "user" where "id" = ${data.userId} limit 1
    `;
    if (!exists[0]) throw new Error("Utilisateur introuvable");

    const id = newId();
    await sql`
      insert into "user_block" ("id", "blocker_id", "blocked_id")
      values (${id}, ${me}, ${data.userId})
      on conflict ("blocker_id", "blocked_id") do nothing
    `;

    // Drop any friendship / pending request either way
    await sql`
      delete from "friendship"
      where
        ("requester_id" = ${me} and "addressee_id" = ${data.userId})
        or ("requester_id" = ${data.userId} and "addressee_id" = ${me})
    `;

    return { ok: true };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const userId = (input as { userId?: string } | null)?.userId?.trim();
    if (!userId) throw new Error("Utilisateur manquant");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      delete from "user_block"
      where "blocker_id" = ${context.userId} and "blocked_id" = ${data.userId}
    `;
    return { ok: true };
  });

export const listBlockedUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BlockedUser[]> => {
    const sql = await getSql();
    try {
      const rows = await sql<ProfileRow & { blocked_at: string | Date }>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
          u."name", u."email", u."image",
          b."created_at" as blocked_at
        from "user_block" b
        join "user_profile" p on p."user_id" = b."blocked_id"
        join "user" u on u."id" = b."blocked_id"
        where b."blocker_id" = ${context.userId}
        order by b."created_at" desc
        limit 200
      `;
      return rows.map((r) => ({
        ...mapRow(r, { isOwner: false }),
        blockedAt: iso(r.blocked_at),
      }));
    } catch {
      return [];
    }
  });

export const getBlockStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const userId = (input as { userId?: string } | null)?.userId?.trim();
    if (!userId) throw new Error("Utilisateur manquant");
    return { userId };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<{ iBlockedThem: boolean; theyBlockedMe: boolean }> => {
      const [iBlockedThem, theyBlockedMe] = await Promise.all([
        hasBlocked(context.userId, data.userId),
        hasBlocked(data.userId, context.userId),
      ]);
      return { iBlockedThem, theyBlockedMe };
    },
  );
