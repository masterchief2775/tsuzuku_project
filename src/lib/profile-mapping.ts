import type {
  FavoriteAnime,
  ProfileRow,
  ProfileStats,
  ProfileVisibility,
  PublicProfile,
} from "./profile.ts";

/**
 * Pure profile projections (no DB, no framework). Tested in
 * `profile-mapping.test.ts`; re-exported by `profile.ts` so existing
 * `import { mapRow } from "@/lib/profile"` call sites keep working.
 */

export const MAX_FAVORITES = 5;

export function parseFavorites(raw: unknown): FavoriteAnime[] {
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

export function sanitizeFavorites(input: unknown): FavoriteAnime[] {
  return parseFavorites(input).slice(0, MAX_FAVORITES);
}

export function normalizeVisibility(row: ProfileRow): ProfileVisibility {
  const v = row.visibility;
  if (v === "public" || v === "friends" || v === "private") return v;
  return row.is_public ? "public" : "private";
}

/** Allowlisted external-link sanitizer for AniList / MAL profile URLs. */
export function sanitizeUrl(raw: string | null | undefined, hosts: string[]): string | null {
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

/** Card/tab title for a public profile (unit-tested). */
export function profileCardTitle(
  profile: PublicProfile | null | undefined,
  fallbackUsername: string,
): string {
  if (profile) return `${profile.displayName} (@${profile.username}) · Tsuzuku`;
  if (profile === null) return "Profil introuvable · Tsuzuku";
  return `@${fallbackUsername} · Tsuzuku`;
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
