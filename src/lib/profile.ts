import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type PublicProfile = {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isPublic: boolean;
  /** Only filled for the owner */
  email?: string | null;
  listCount?: number;
  isOwner?: boolean;
};

const USERNAME_RE = /^[a-z0-9][a-z0-9_]{2,23}$/;

function slugifyUsername(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 24);
}

function defaultUsername(userId: string, name: string | null): string {
  const base = slugifyUsername(name || "user") || "user";
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase() || "0000";
  let candidate = `${base}_${suffix}`.slice(0, 24);
  if (!USERNAME_RE.test(candidate)) candidate = `user_${suffix}`.slice(0, 24);
  return candidate;
}

type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string;
  avatar_url: string | null;
  is_public: boolean;
  name: string | null;
  email: string | null;
  image: string | null;
};

function mapRow(row: ProfileRow, opts?: { isOwner?: boolean; listCount?: number }): PublicProfile {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name || row.name || row.username,
    bio: row.bio || "",
    avatarUrl: row.avatar_url || row.image || null,
    isPublic: row.is_public,
    email: opts?.isOwner ? row.email : undefined,
    listCount: opts?.listCount,
    isOwner: opts?.isOwner,
  };
}

async function ensureProfile(userId: string): Promise<ProfileRow> {
  const sql = await getSql();
  const existing = await sql<ProfileRow>`
    select
      p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
      u."name", u."email", u."image"
    from "user_profile" p
    join "user" u on u."id" = p."user_id"
    where p."user_id" = ${userId}
  `;
  if (existing[0]) return existing[0];

  const users = await sql<{ name: string | null; email: string | null; image: string | null }>`
    select "name", "email", "image" from "user" where "id" = ${userId}
  `;
  const u = users[0];
  if (!u) throw new Error("Utilisateur introuvable");

  let username = defaultUsername(userId, u.name);
  // Ensure unique
  for (let i = 0; i < 8; i++) {
    const clash = await sql<{ n: number }>`
      select 1 as n from "user_profile" where lower("username") = lower(${username}) limit 1
    `;
    if (!clash[0]) break;
    const suffix = Math.floor(Math.random() * 9000 + 1000).toString();
    username = `${username.slice(0, 19)}_${suffix}`.slice(0, 24);
  }

  await sql`
    insert into "user_profile" ("user_id", "username", "display_name", "bio", "avatar_url", "is_public")
    values (${userId}, ${username}, ${u.name}, '', ${u.image}, true)
    on conflict ("user_id") do nothing
  `;

  const again = await sql<ProfileRow>`
    select
      p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
      u."name", u."email", u."image"
    from "user_profile" p
    join "user" u on u."id" = p."user_id"
    where p."user_id" = ${userId}
  `;
  if (!again[0]) throw new Error("Impossible de créer le profil");
  return again[0];
}

async function listCountFor(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ entries: unknown }>`
    select "entries" from "watchlist_state" where "user_id" = ${userId}
  `;
  const raw = rows[0]?.entries;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Own profile (creates a default row on first visit). */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicProfile> => {
    const row = await ensureProfile(context.userId);
    const count = await listCountFor(context.userId);
    return mapRow(row, { isOwner: true, listCount: count });
  });

export type UpdateProfileInput = {
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
};

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const p = (input || {}) as UpdateProfileInput;
    return {
      username: typeof p.username === "string" ? p.username.trim().toLowerCase() : undefined,
      displayName: typeof p.displayName === "string" ? p.displayName.trim().slice(0, 48) : undefined,
      bio: typeof p.bio === "string" ? p.bio.trim().slice(0, 280) : undefined,
      avatarUrl:
        p.avatarUrl === null
          ? null
          : typeof p.avatarUrl === "string"
            ? p.avatarUrl.slice(0, 600_000) // allow modest data-URL avatars
            : undefined,
      isPublic: typeof p.isPublic === "boolean" ? p.isPublic : undefined,
    } satisfies UpdateProfileInput;
  })
  .handler(async ({ data, context }): Promise<PublicProfile> => {
    await ensureProfile(context.userId);
    const sql = await getSql();

    if (data.username !== undefined) {
      if (!USERNAME_RE.test(data.username)) {
        throw new Error(
          "Pseudo invalide : 3–24 caractères, lettres minuscules, chiffres et _ uniquement.",
        );
      }
      const taken = await sql<{ user_id: string }>`
        select "user_id" from "user_profile"
        where lower("username") = lower(${data.username}) and "user_id" <> ${context.userId}
        limit 1
      `;
      if (taken[0]) throw new Error("Ce pseudo est déjà pris.");
      await sql`
        update "user_profile" set "username" = ${data.username}, "updated_at" = current_timestamp
        where "user_id" = ${context.userId}
      `;
    }

    if (data.displayName !== undefined) {
      const name = data.displayName || "Utilisateur";
      await sql`
        update "user_profile" set "display_name" = ${name}, "updated_at" = current_timestamp
        where "user_id" = ${context.userId}
      `;
      // Keep Better Auth session name in sync
      await sql`
        update "user" set "name" = ${name}, "updatedAt" = current_timestamp
        where "id" = ${context.userId}
      `;
    }

    if (data.bio !== undefined) {
      await sql`
        update "user_profile" set "bio" = ${data.bio}, "updated_at" = current_timestamp
        where "user_id" = ${context.userId}
      `;
    }

    if (data.avatarUrl !== undefined) {
      await sql`
        update "user_profile" set "avatar_url" = ${data.avatarUrl}, "updated_at" = current_timestamp
        where "user_id" = ${context.userId}
      `;
      await sql`
        update "user" set "image" = ${data.avatarUrl}, "updatedAt" = current_timestamp
        where "id" = ${context.userId}
      `;
    }

    if (data.isPublic !== undefined) {
      await sql`
        update "user_profile" set "is_public" = ${data.isPublic}, "updated_at" = current_timestamp
        where "user_id" = ${context.userId}
      `;
    }

    const row = await ensureProfile(context.userId);
    const count = await listCountFor(context.userId);
    return mapRow(row, { isOwner: true, listCount: count });
  });

/** Public lookup by username — no auth required. Private profiles only visible to owner. */
export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const username = (input as { username?: string } | null)?.username?.trim().toLowerCase();
    if (!username || username.length < 2) throw new Error("Pseudo manquant");
    return { username };
  })
  .handler(async ({ data }): Promise<PublicProfile | null> => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        u."name", u."email", u."image"
      from "user_profile" p
      join "user" u on u."id" = p."user_id"
      where lower(p."username") = lower(${data.username})
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (!row.is_public) return null;
    const count = await listCountFor(row.user_id);
    return mapRow(row, { isOwner: false, listCount: count });
  });

export const searchProfiles = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const q = (input as { q?: string } | null)?.q?.trim() ?? "";
    return { q: q.slice(0, 40) };
  })
  .handler(async ({ data }): Promise<PublicProfile[]> => {
    const sql = await getSql();
    if (!data.q || data.q.length < 2) return [];
    const pattern = `%${data.q.toLowerCase()}%`;
    const rows = await sql<ProfileRow>`
      select
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        u."name", u."email", u."image"
      from "user_profile" p
      join "user" u on u."id" = p."user_id"
      where p."is_public" = true
        and (
          lower(p."username") like ${pattern}
          or lower(coalesce(p."display_name", '')) like ${pattern}
          or lower(coalesce(u."name", '')) like ${pattern}
        )
      order by p."username" asc
      limit 20
    `;
    return rows.map((r) => mapRow(r, { isOwner: false }));
  });

/** Permanently delete the signed-in account and all related data (cascade). */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const confirm = (input as { confirm?: string } | null)?.confirm;
    if (confirm !== "SUPPRIMER") {
      throw new Error('Tape « SUPPRIMER » pour confirmer.');
    }
    return { confirm };
  })
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    // Cascades: session, account, user_profile, watchlist_state, watchlist_share
    await sql`delete from "user" where "id" = ${context.userId}`;
    return { ok: true };
  });
