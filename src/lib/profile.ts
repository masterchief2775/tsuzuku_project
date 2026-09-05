import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type ProfileVisibility = "public" | "friends" | "private";

export type FavoriteAnime = {
  anilistId: number;
  title: string;
  image: string | null;
};

export type ProfileStats = {
  total: number;
  watching: number;
  completed: number;
  planToWatch: number;
  onHold: number;
  dropped: number;
  avgRating: number | null;
  ratedCount: number;
  episodesWatched: number;
};

export type PublicProfile = {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  /** @deprecated prefer visibility */
  isPublic: boolean;
  visibility: ProfileVisibility;
  showStats: boolean;
  showFavorites: boolean;
  favorites: FavoriteAnime[];
  anilistUrl: string | null;
  malUrl: string | null;
  stats?: ProfileStats | null;
  email?: string | null;
  listCount?: number;
  isOwner?: boolean;
  isFriend?: boolean;
};

const USERNAME_RE = /^[a-z0-9][a-z0-9_]{2,23}$/;
const MAX_FAVORITES = 5;

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
  let base = slugifyUsername(name || "user").replace(/[^a-z0-9_]/g, "");
  if (base.length < 2) base = "user";
  const suffix = (userId.replace(/[^a-z0-9]/gi, "").slice(-6) || "000000").toLowerCase();
  let candidate = `${base.slice(0, 16)}_${suffix}`.slice(0, 24).toLowerCase();
  if (!USERNAME_RE.test(candidate)) {
    candidate = `user_${suffix}`.slice(0, 24);
  }
  return candidate;
}

export type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string;
  avatar_url: string | null;
  is_public: boolean;
  visibility?: string | null;
  show_stats?: boolean | null;
  show_favorites?: boolean | null;
  favorites?: unknown;
  anilist_url?: string | null;
  mal_url?: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
};

function parseFavorites(raw: unknown): FavoriteAnime[] {
  if (!Array.isArray(raw)) return [];
  const out: FavoriteAnime[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const anilistId = Number(o.anilistId);
    if (!Number.isFinite(anilistId) || anilistId <= 0) continue;
    const title = typeof o.title === "string" ? o.title.slice(0, 200) : "";
    if (!title) continue;
    const image = typeof o.image === "string" ? o.image : null;
    out.push({ anilistId, title, image });
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

function normalizeVisibility(row: ProfileRow): ProfileVisibility {
  const v = row.visibility;
  if (v === "public" || v === "friends" || v === "private") return v;
  return row.is_public ? "public" : "private";
}

export function mapRow(
  row: ProfileRow,
  opts?: {
    isOwner?: boolean;
    listCount?: number;
    stats?: ProfileStats | null;
    isFriend?: boolean;
  },
): PublicProfile {
  const visibility = normalizeVisibility(row);
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name || row.name || row.username,
    bio: row.bio || "",
    avatarUrl: row.avatar_url || row.image || null,
    isPublic: visibility === "public",
    visibility,
    showStats: row.show_stats !== false,
    showFavorites: row.show_favorites !== false,
    favorites: parseFavorites(row.favorites),
    anilistUrl: row.anilist_url || null,
    malUrl: row.mal_url || null,
    stats: opts?.stats ?? null,
    email: opts?.isOwner ? row.email : undefined,
    listCount: opts?.listCount,
    isOwner: opts?.isOwner,
    isFriend: opts?.isFriend,
  };
}

async function ensureProfile(userId: string): Promise<ProfileRow> {
  const sql = await getSql();
  let existing: ProfileRow[] = [];
  try {
    existing = await sql<ProfileRow>`
      select
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
        u."name", u."email", u."image"
      from "user_profile" p
      join "user" u on u."id" = p."user_id"
      where p."user_id" = ${userId}
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user_profile|does not exist|relation/i.test(msg)) {
      throw new Error(
        "Table profil absente — applique la migration 0004_profiles.sql puis redéploie.",
      );
    }
    if (/visibility|show_stats|favorites|anilist_url|mal_url|column/i.test(msg)) {
      existing = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where p."user_id" = ${userId}
      `;
    } else {
      throw err;
    }
  }
  if (existing[0]) return existing[0];

  const users = await sql<{ name: string | null; email: string | null; image: string | null }>`
    select "name", "email", "image" from "user" where "id" = ${userId}
  `;
  const u = users[0];
  if (!u) throw new Error("Utilisateur introuvable");

  let username = defaultUsername(userId, u.name);
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

  try {
    const again = await sql<ProfileRow>`
      select
        p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
        p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
        u."name", u."email", u."image"
      from "user_profile" p
      join "user" u on u."id" = p."user_id"
      where p."user_id" = ${userId}
    `;
    if (!again[0]) throw new Error("Impossible de créer le profil");
    return again[0];
  } catch {
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
}

async function loadEntriesRaw(userId: string): Promise<unknown[]> {
  const sql = await getSql();
  const rows = await sql<{ entries: unknown }>`
    select "entries" from "watchlist_state" where "user_id" = ${userId}
  `;
  const raw = rows[0]?.entries;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeStats(entries: unknown[]): ProfileStats {
  const list = entries as Array<{
    status?: string;
    rating?: number | null;
    progress?: number;
  }>;
  let watching = 0;
  let completed = 0;
  let planToWatch = 0;
  let onHold = 0;
  let dropped = 0;
  let ratingSum = 0;
  let ratedCount = 0;
  let episodesWatched = 0;
  for (const e of list) {
    const s = e.status;
    if (s === "Watching") watching++;
    else if (s === "Completed") completed++;
    else if (s === "Plan to Watch") planToWatch++;
    else if (s === "On Hold") onHold++;
    else if (s === "Dropped") dropped++;
    if (typeof e.rating === "number" && e.rating > 0) {
      ratingSum += e.rating;
      ratedCount++;
    }
    if (typeof e.progress === "number" && e.progress > 0) {
      episodesWatched += e.progress;
    }
  }
  return {
    total: list.length,
    watching,
    completed,
    planToWatch,
    onHold,
    dropped,
    avgRating: ratedCount ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
    ratedCount,
    episodesWatched,
  };
}

async function areFriends(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const sql = await getSql();
  try {
    const rows = await sql<{ n: number }>`
      select 1 as n from "friendship"
      where "status" = 'accepted'
        and (
          ("requester_id" = ${a} and "addressee_id" = ${b})
          or ("requester_id" = ${b} and "addressee_id" = ${a})
        )
      limit 1
    `;
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

function sanitizeUrl(raw: string | null | undefined, hosts: string[]): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      throw new Error(`URL non autorisée (attendu : ${hosts.join(", ")})`);
    }
    return u.toString().slice(0, 300);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL non")) throw err;
    throw new Error("URL invalide");
  }
}

function sanitizeFavorites(input: unknown): FavoriteAnime[] {
  return parseFavorites(input).slice(0, MAX_FAVORITES);
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicProfile> => {
    const row = await ensureProfile(context.userId);
    const entries = await loadEntriesRaw(context.userId);
    return mapRow(row, {
      isOwner: true,
      listCount: entries.length,
      stats: computeStats(entries),
    });
  });

type UpdateProfileInput = {
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
  visibility?: ProfileVisibility;
  showStats?: boolean;
  showFavorites?: boolean;
  favorites?: FavoriteAnime[];
  anilistUrl?: string | null;
  malUrl?: string | null;
};

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const p = (input || {}) as Record<string, unknown>;
    const visibility = p.visibility;
    if (
      visibility !== undefined &&
      visibility !== "public" &&
      visibility !== "friends" &&
      visibility !== "private"
    ) {
      throw new Error("Visibilité invalide");
    }
    return {
      username: typeof p.username === "string" ? p.username.trim().toLowerCase() : undefined,
      displayName: typeof p.displayName === "string" ? p.displayName.trim().slice(0, 80) : undefined,
      bio: typeof p.bio === "string" ? p.bio.trim().slice(0, 500) : undefined,
      avatarUrl:
        p.avatarUrl === null
          ? null
          : typeof p.avatarUrl === "string"
            ? p.avatarUrl.slice(0, 60_000)
            : undefined,
      isPublic: typeof p.isPublic === "boolean" ? p.isPublic : undefined,
      visibility: visibility as ProfileVisibility | undefined,
      showStats: typeof p.showStats === "boolean" ? p.showStats : undefined,
      showFavorites: typeof p.showFavorites === "boolean" ? p.showFavorites : undefined,
      favorites: p.favorites !== undefined ? sanitizeFavorites(p.favorites) : undefined,
      anilistUrl:
        p.anilistUrl === null
          ? null
          : typeof p.anilistUrl === "string"
            ? p.anilistUrl
            : undefined,
      malUrl: p.malUrl === null ? null : typeof p.malUrl === "string" ? p.malUrl : undefined,
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

    if (data.visibility !== undefined) {
      const isPublic = data.visibility === "public";
      try {
        await sql`
          update "user_profile"
          set "visibility" = ${data.visibility}, "is_public" = ${isPublic}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        await sql`
          update "user_profile" set "is_public" = ${isPublic}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      }
    } else if (data.isPublic !== undefined) {
      const visibility = data.isPublic ? "public" : "private";
      try {
        await sql`
          update "user_profile"
          set "is_public" = ${data.isPublic}, "visibility" = ${visibility}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        await sql`
          update "user_profile" set "is_public" = ${data.isPublic}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      }
    }

    if (data.showStats !== undefined) {
      try {
        await sql`
          update "user_profile" set "show_stats" = ${data.showStats}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        /* migration pending */
      }
    }

    if (data.showFavorites !== undefined) {
      try {
        await sql`
          update "user_profile" set "show_favorites" = ${data.showFavorites}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        /* migration pending */
      }
    }

    if (data.favorites !== undefined) {
      const json = JSON.stringify(data.favorites);
      try {
        await sql`
          update "user_profile" set "favorites" = ${json}::jsonb, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        /* migration pending */
      }
    }

    if (data.anilistUrl !== undefined) {
      const url = data.anilistUrl === null ? null : sanitizeUrl(data.anilistUrl, ["anilist.co"]);
      try {
        await sql`
          update "user_profile" set "anilist_url" = ${url}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        /* migration pending */
      }
    }

    if (data.malUrl !== undefined) {
      const url = data.malUrl === null ? null : sanitizeUrl(data.malUrl, ["myanimelist.net"]);
      try {
        await sql`
          update "user_profile" set "mal_url" = ${url}, "updated_at" = current_timestamp
          where "user_id" = ${context.userId}
        `;
      } catch {
        /* migration pending */
      }
    }

    const row = await ensureProfile(context.userId);
    const entries = await loadEntriesRaw(context.userId);
    return mapRow(row, {
      isOwner: true,
      listCount: entries.length,
      stats: computeStats(entries),
    });
  });

export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const username = (input as { username?: string } | null)?.username?.trim().toLowerCase();
    if (!username || username.length < 2) throw new Error("Pseudo manquant");
    return { username };
  })
  .handler(async ({ data }): Promise<PublicProfile | null> => {
    const sql = await getSql();
    let rows: ProfileRow[];
    try {
      rows = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where lower(p."username") = lower(${data.username})
        limit 1
      `;
    } catch {
      rows = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where lower(p."username") = lower(${data.username})
        limit 1
      `;
    }
    const row = rows[0];
    if (!row) return null;
    const visibility = normalizeVisibility(row);
    if (visibility !== "public") return null;

    const entries = await loadEntriesRaw(row.user_id);
    const showStats = row.show_stats !== false;
    return mapRow(row, {
      isOwner: false,
      listCount: entries.length,
      stats: showStats ? computeStats(entries) : null,
    });
  });

export const getProfileByUsernameAuthed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const username = (input as { username?: string } | null)?.username?.trim().toLowerCase();
    if (!username || username.length < 2) throw new Error("Pseudo manquant");
    return { username };
  })
  .handler(async ({ data, context }): Promise<PublicProfile | null> => {
    const sql = await getSql();
    let rows: ProfileRow[];
    try {
      rows = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where lower(p."username") = lower(${data.username})
        limit 1
      `;
    } catch {
      rows = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where lower(p."username") = lower(${data.username})
        limit 1
      `;
    }
    const row = rows[0];
    if (!row) return null;

    const visibility = normalizeVisibility(row);
    const isOwner = row.user_id === context.userId;
    const isFriend = isOwner ? false : await areFriends(context.userId, row.user_id);

    if (visibility === "private" && !isOwner) return null;
    if (visibility === "friends" && !isOwner && !isFriend) return null;

    const entries = await loadEntriesRaw(row.user_id);
    const showStats = row.show_stats !== false;
    return mapRow(row, {
      isOwner,
      isFriend,
      listCount: entries.length,
      stats: isOwner || showStats ? computeStats(entries) : null,
    });
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
    let rows: ProfileRow[];
    try {
      rows = await sql<ProfileRow>`
        select
          p."user_id", p."username", p."display_name", p."bio", p."avatar_url", p."is_public",
          p."visibility", p."show_stats", p."show_favorites", p."favorites", p."anilist_url", p."mal_url",
          u."name", u."email", u."image"
        from "user_profile" p
        join "user" u on u."id" = p."user_id"
        where (p."visibility" = 'public' or (p."visibility" is null and p."is_public" = true))
          and (
            lower(p."username") like ${pattern}
            or lower(coalesce(p."display_name", '')) like ${pattern}
            or lower(coalesce(u."name", '')) like ${pattern}
          )
        order by p."username" asc
        limit 20
      `;
    } catch {
      rows = await sql<ProfileRow>`
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
    }
    return rows.map((r) => mapRow(r, { isOwner: false }));
  });

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
    await sql`delete from "user" where "id" = ${context.userId}`;
    return { ok: true };
  });
