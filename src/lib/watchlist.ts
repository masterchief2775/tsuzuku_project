export const STORAGE_KEY = "tsuzuku-watchlist";

export function storageKeyForUser(userId?: string | null) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export const STATUSES = [
  { key: "Plan to Watch", label: "À regarder", color: "var(--color-status-plan)" },
  { key: "Watching", label: "En cours", color: "var(--color-status-watching)" },
  { key: "Completed", label: "Terminé", color: "var(--color-status-completed)" },
  { key: "On Hold", label: "En pause", color: "var(--color-status-hold)" },
  { key: "Dropped", label: "Abandonné", color: "var(--color-status-dropped)" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];

export type MediaFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "SPECIAL"
  | "OVA"
  | "ONA"
  | "MUSIC"
  | string
  | null;

export type WatchlistEntry = {
  id: string;
  anilistId: number;
  title: string;
  image: string | null;
  /** AniList landscape banner (for dashboard "En cours", etc.) */
  bannerImage?: string | null;
  totalEpisodes: number | null;
  genres: string[];
  year: number | null;
  studio: string;
  format: MediaFormat;
  status: StatusKey;
  progress: number;
  rating: number | null;
  comment: string;
  tags: string[];
  /**
   * Co-watching friends (user ids of accepted friends).
   * Legacy free-text names may still appear until cleaned by the user.
   */
  withPeople: string[];
  addedAt: string;
  updatedAt: string;
  /** Cached next airing info (refreshed periodically for Watching entries) */
  nextAiring?: {
    airingAt: number;
    episode: number;
    fetchedAt: string;
  } | null;
  /**
   * AniList's airing status for the series, distinct from `status` above (which
   * is the user's own progress). Absent on entries stored before this field
   * existed, which is why every read treats `undefined` as "unknown".
   */
  airingStatus?: AniListAiringStatus | null;
  /** ISO date of the last airing day, when AniList records a complete one. */
  airingEndedOn?: string | null;
};

export type NextAiringEpisode = {
  airingAt: number; // unix timestamp
  episode: number;
  timeUntilAiring: number; // seconds
};

/**
 * AniList's own airing status for a title — NOT the user's watchlist status.
 *
 * Needed to tell three apart that all look identical in `nextAiringEpisode`
 * (a `null` airing): a series that has finished for good, one still running with
 * no announced total (One Piece), and one we simply have no data for. Without it
 * the timeline labelled a completed series like Black Clover "diffusion inconnue".
 */
export type AniListAiringStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "HIATUS"
  | "CANCELLED";

export type AniListMedia = {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null; color: string | null } | null;
  bannerImage?: string | null;
  episodes: number | null;
  genres: string[] | null;
  seasonYear: number | null;
  studios: { nodes: { name: string }[] } | null;
  averageScore: number | null;
  format: MediaFormat;
  /** Airing status of the series itself; absent on payloads fetched before. */
  status?: AniListAiringStatus | null;
  /** Last day of airing, when AniList records a complete one. */
  endDate?: { year: number | null; month: number | null; day: number | null } | null;
  nextAiringEpisode?: NextAiringEpisode | null;
};

/**
 * ISO date (YYYY-MM-DD) of the last airing day, or null when AniList leaves any
 * part of the date open — a year-only end date is not precise enough to show.
 */
export function airingEndDate(
  endDate: AniListMedia["endDate"],
): string | null {
  const y = endDate?.year ?? null;
  const m = endDate?.month ?? null;
  const d = endDate?.day ?? null;
  if (y == null || m == null || d == null) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** True when the series is over and no further episode will ever air. */
export function hasFinishedAiring(
  status: AniListAiringStatus | null | undefined,
): boolean {
  return status === "FINISHED" || status === "CANCELLED";
}

/** Rich fields fetched only for the entry detail modal. */
export type AniListMediaDetail = AniListMedia & {
  description: string | null;
  bannerImage: string | null;
  season: string | null;
  siteUrl: string | null;
  trailer: { id: string | null; site: string | null; thumbnail: string | null } | null;
};

export type MediaKind = "film" | "ova" | "special" | "series";

export function statusMeta(key: StatusKey) {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function mediaTitle(media: AniListMedia) {
  return media.title.romaji || media.title.english || media.title.native || "Sans titre";
}

export function mediaKind(format: MediaFormat, totalEpisodes: number | null): MediaKind {
  if (format === "MOVIE") return "film";
  if (format === "OVA") return "ova";
  if (format === "SPECIAL" || format === "MUSIC") return "special";
  if (totalEpisodes === 1 && format !== "TV" && format !== "ONA" && format !== "TV_SHORT") {
    return "film";
  }
  return "series";
}

export function kindLabel(kind: MediaKind): string {
  if (kind === "film") return "Film";
  if (kind === "ova") return "OVA";
  if (kind === "special") return "Spécial";
  return "";
}

/** Card / list progress line — never shows "? ép." */
export function progressText(entry: Pick<WatchlistEntry, "progress" | "totalEpisodes" | "format">) {
  const kind = mediaKind(entry.format, entry.totalEpisodes);
  const label = kindLabel(kind);
  if (kind !== "series") {
    if (entry.totalEpisodes && entry.totalEpisodes > 1) {
      return `${entry.progress}/${entry.totalEpisodes} · ${label}`;
    }
    return label;
  }
  if (entry.totalEpisodes) return `${entry.progress}/${entry.totalEpisodes} ép.`;
  return `${entry.progress} ép.`;
}

/** Human-readable countdown for next episode, e.g. "Ép. 8 dans 3 j" */
export function nextAiringText(entry: Pick<WatchlistEntry, "nextAiring" | "status">): string | null {
  if (entry.status !== "Watching" || !entry.nextAiring) return null;
  // Sentinel: airingAt 0 means "checked, nothing upcoming"
  if (entry.nextAiring.airingAt <= 0 || entry.nextAiring.episode <= 0) return null;
  const now = Math.floor(Date.now() / 1000);
  const seconds = entry.nextAiring.airingAt - now;
  if (seconds <= 0) return `Ép. ${entry.nextAiring.episode} disponible`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days >= 1) return `Ép. ${entry.nextAiring.episode} dans ${days} j`;
  if (hours >= 1) return `Ép. ${entry.nextAiring.episode} dans ${hours} h`;
  return `Ép. ${entry.nextAiring.episode} dans ${mins} min`;
}

/** True if nextAiring cache is older than 6 hours */
export function isNextAiringStale(entry: Pick<WatchlistEntry, "nextAiring">): boolean {
  if (!entry.nextAiring?.fetchedAt) return true;
  const age = Date.now() - new Date(entry.nextAiring.fetchedAt).getTime();
  return age > 6 * 60 * 60 * 1000;
}

/** Watching entries with a next episode airing within the next 7 days, sorted soonest first */
export function upcomingThisWeek(entries: WatchlistEntry[]): WatchlistEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const week = now + 7 * 24 * 3600;
  return entries
    .filter((e) => {
      if (e.status !== "Watching" || !e.nextAiring) return false;
      const at = e.nextAiring.airingAt;
      if (at <= 0 || e.nextAiring.episode <= 0) return false;
      return at >= now - 3600 && at <= week; // allow 1h past for "bientôt"
    })
    .sort((a, b) => a.nextAiring!.airingAt - b.nextAiring!.airingAt);
}

/** All watching entries with a valid next airing (any future window, +1h past). */
export function upcomingAiring(entries: WatchlistEntry[], withinDays = 28): WatchlistEntry[] {
  const now = Math.floor(Date.now() / 1000);
  const until = now + withinDays * 24 * 3600;
  return entries
    .filter((e) => {
      if (e.status !== "Watching" || !e.nextAiring) return false;
      const at = e.nextAiring.airingAt;
      if (at <= 0 || e.nextAiring.episode <= 0) return false;
      return at >= now - 3600 && at <= until;
    })
    .sort((a, b) => a.nextAiring!.airingAt - b.nextAiring!.airingAt);
}

export function airingOnDay(entries: WatchlistEntry[], day: Date): WatchlistEntry[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() / 1000;
  const end = start + 86400;
  return upcomingAiring(entries, 60).filter((e) => {
    const at = e.nextAiring!.airingAt;
    return at >= start && at < end;
  });
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Format airing time in local TZ, e.g. "14:30" or "mar. 14:30" */
export function formatAiringTime(airingAt: number, opts?: { withDay?: boolean }) {
  const d = new Date(airingAt * 1000);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (!opts?.withDay) return time;
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${time}`;
}

export function searchMetaLine(media: AniListMedia) {
  const year = media.seasonYear || "—";
  const kind = mediaKind(media.format, media.episodes);
  const label = kindLabel(kind);
  const eps =
    kind !== "series"
      ? label
      : media.episodes
        ? `${media.episodes} ép.`
        : "ép. inconnu";
  const score = media.averageScore ? ` · ${(media.averageScore / 10).toFixed(1)}★` : "";
  return `${year} · ${eps}${score}`;
}

export function clampProgress(progress: number, total: number | null) {
  const n = Math.max(0, Math.floor(Number.isFinite(progress) ? progress : 0));
  if (total == null || total <= 0) return n;
  return Math.min(n, total);
}

export function shouldAutoComplete(
  status: StatusKey,
  progress: number,
  total: number | null,
) {
  if (total == null || total <= 0) return false;
  if (progress < total) return false;
  if (status === "Completed" || status === "Dropped") return false;
  return true;
}

export function initialsFromTitle(title: string) {
  const parts = title
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "尋";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function hashHue(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function loadEntries(userId?: string | null): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry);
  } catch {
    return [];
  }
}

export function persistEntries(entries: WatchlistEntry[], userId?: string | null) {
  localStorage.setItem(storageKeyForUser(userId), JSON.stringify(entries));
}

function normalizeEntry(e: WatchlistEntry): WatchlistEntry {
  return {
    ...e,
    format: e.format ?? null,
    image: e.image || null,
    bannerImage: e.bannerImage ?? null,
    totalEpisodes: e.totalEpisodes ?? null,
    genres: e.genres || [],
    tags: e.tags || [],
    withPeople: Array.isArray((e as any).withFriendIds)
      ? (e as any).withFriendIds
      : e.withPeople || [],
    comment: e.comment || "",
    studio: e.studio || "",
    nextAiring: e.nextAiring ?? null,
  };
}

export function entryFromMedia(media: AniListMedia): WatchlistEntry {
  const now = new Date().toISOString();
  return {
    id: uid(),
    anilistId: media.id,
    title: mediaTitle(media),
    image: media.coverImage?.large || null,
    bannerImage: media.bannerImage || null,
    totalEpisodes: media.episodes ?? null,
    genres: media.genres || [],
    year: media.seasonYear ?? null,
    studio: media.studios?.nodes?.[0]?.name || "",
    format: media.format ?? null,
    airingStatus: media.status ?? null,
    airingEndedOn: airingEndDate(media.endDate),
    status: "Plan to Watch",
    progress: 0,
    rating: null,
    comment: "",
    tags: [],
    withPeople: [],
    addedAt: now,
    updatedAt: now,
    nextAiring: media.nextAiringEpisode
      ? {
          airingAt: media.nextAiringEpisode.airingAt,
          episode: media.nextAiringEpisode.episode,
          fetchedAt: now,
        }
      : null,
  };
}

export function exportFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `tsuzuku-watchlist-${y}-${m}-${d}.json`;
}

export function downloadWatchlistJson(entries: WatchlistEntry[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large color }
  bannerImage
  episodes
  genres
  seasonYear
  format
  studios(isMain: true) { nodes { name } }
  averageScore
  status
  endDate { year month day }
  nextAiringEpisode {
    airingAt
    episode
    timeUntilAiring
  }
`;

const SEARCH_GQL = `query ($search: String) { Page(perPage: 12) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`;
const TRENDING_GQL = `query { Page(perPage: 12) { media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ${MEDIA_FIELDS} } } }`;
const MEDIA_BY_ID_GQL = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`;
const MEDIA_BY_IDS_GQL = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} } } }`;

const MEDIA_DETAIL_FIELDS = `
  ${MEDIA_FIELDS}
  description(asHtml: false)
  season
  siteUrl
  trailer { id site thumbnail }
`;

const MEDIA_BY_ID_DETAIL_GQL = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_DETAIL_FIELDS} } }`;
const GENRE_RECO_GQL = `query ($genres: [String], $perPage: Int) {
  Page(perPage: $perPage) {
    media(genre_in: $genres, type: ANIME, isAdult: false, sort: SCORE_DESC) { ${MEDIA_FIELDS} }
  }
}`;

/** Large, pageable pool for the roulette (format + genre filters server-side). */
const ROULETTE_POOL_GQL = `query (
  $page: Int,
  $perPage: Int,
  $genres: [String],
  $format_in: [MediaFormat],
  $sort: [MediaSort]
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { lastPage hasNextPage }
    media(
      type: ANIME
      isAdult: false
      genre_in: $genres
      format_in: $format_in
      sort: $sort
    ) { ${MEDIA_FIELDS} }
  }
}`;
const SEASON_GQL = `query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
  Page(page: $page, perPage: 24) {
    media(season: $season, seasonYear: $seasonYear, type: ANIME, isAdult: false, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
  }
}`;

export type AniListSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export const SEASON_LABELS: Record<AniListSeason, string> = {
  WINTER: "Hiver",
  SPRING: "Printemps",
  SUMMER: "Été",
  FALL: "Automne",
};

/** AniList season from a calendar date */
export function seasonFromDate(d = new Date()): { season: AniListSeason; year: number } {
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

/** Seasons covering roughly the last 5 years (for the season picker) */
export function recentSeasonOptions(from = new Date()): { season: AniListSeason; year: number; label: string }[] {
  const order: AniListSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const cur = seasonFromDate(from);
  const startIdx = order.indexOf(cur.season);
  const out: { season: AniListSeason; year: number; label: string }[] = [];
  let y = cur.year;
  let i = startIdx;
  for (let n = 0; n < 20; n++) {
    // 5 years × 4 seasons
    out.push({
      season: order[i],
      year: y,
      label: `${SEASON_LABELS[order[i]]} ${y}`,
    });
    i -= 1;
    if (i < 0) {
      i = 3;
      y -= 1;
    }
  }
  return out;
}

export function fetchByGenres(
  genres: string[],
  perPage = 16,
  signal?: AbortSignal,
): Promise<AniListMedia[]> {
  if (genres.length === 0) return Promise.resolve([]);
  return fetchAniList(GENRE_RECO_GQL, { genres, perPage }, signal);
}

export type RouletteFormatFilter = "all" | "series" | "film" | "ova";
export type RouletteDiscoveryMode = "random" | "trending" | "popular";

const ROULETTE_FORMATS: Record<Exclude<RouletteFormatFilter, "all">, string[]> = {
  series: ["TV", "TV_SHORT", "ONA"],
  film: ["MOVIE"],
  ova: ["OVA", "SPECIAL"],
};

const ROULETTE_SORTS = [
  "POPULARITY_DESC",
  "SCORE_DESC",
  "TRENDING_DESC",
  "FAVOURITES_DESC",
  "ID_DESC",
  "START_DATE_DESC",
] as const;

/** Fixed sort used for the non-random discovery modes — every page pulled
 *  stays on this ranking instead of mixing sorts, so "Tendances"/"Populaires"
 *  actually reflect that ranking rather than a general shuffle. */
const DISCOVERY_MODE_SORT: Record<Exclude<RouletteDiscoveryMode, "random">, string> = {
  trending: "TRENDING_DESC",
  popular: "POPULARITY_DESC",
};

/**
 * Build a ~50-title AniList pool for the roulette.
 * - mode "random" (default): multiple random pages + mixed sorts so results
 *   aren't stuck on the same trending set.
 * - mode "trending" / "popular": stays on the first pages of that single
 *   ranking, so the pool is genuinely made of trending/most-popular titles
 *   instead of anything AniList has.
 * Format/genre are applied in the GraphQL query (not only client-side) so filters stay full.
 */
const ANILIST_ENDPOINT = "https://graphql.anilist.co";

type AniListEnvelope<T> = { data?: T; errors?: { message: string }[] };

/**
 * The single AniList GraphQL transport.
 *
 * This POST plus its HTTP/GraphQL error handling used to be copy-pasted five
 * times in this file, which meant a retry, a timeout or a rate-limit policy (the
 * API allows ~90 req/min) had five places to be added and five chances to drift.
 *
 * `tolerant` keeps the one caller that must never throw: the MAL import, where
 * an unknown id resolves to `null` instead of failing the whole import.
 */
async function anilistGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
  opts?: { tolerant?: boolean },
): Promise<AniListEnvelope<T>> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) {
    if (opts?.tolerant) return {};
    const body = await res.text().catch(() => "");
    throw new Error("AniList a répondu " + res.status + " " + body.slice(0, 200));
  }
  return (await res.json()) as AniListEnvelope<T>;
}

/** Same transport, but surfaces GraphQL-level errors as exceptions. */
async function anilistData<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const json = await anilistGraphql<T>(query, variables, signal);
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
  return (json.data ?? {}) as T;
}

/**
 * One relation as AniList reports it.
 *
 * Direction, verified against the live API: `relationType` describes how the
 * NODE relates to the queried media. Cowboy Bebop returns
 * `SEQUEL -> Cowboy Bebop: Tengoku no Tobira`, i.e. the node is the sequel and
 * therefore comes LATER. So `SEQUEL` means "watch the current media first".
 */
export type AniListRelationType =
  | "PREQUEL"
  | "SEQUEL"
  | "PARENT"
  | "SUMMARY"
  | "SIDE_STORY"
  | "ALTERNATIVE"
  | "SPIN_OFF"
  | "ADAPTATION"
  | "CHARACTER"
  | "OTHER";

export type AniListRelation = {
  type: AniListRelationType;
  node: {
    id: number;
    title: { romaji: string | null; english: string | null; native: string | null };
    coverImage: { large: string | null } | null;
    format: MediaFormat;
    episodes: number | null;
    seasonYear: number | null;
  };
};

/** Minimal projection: relations only, so a lookup never widens the payload. */
const RELATIONS_GQL = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      title { romaji english native }
      coverImage { large }
      format
      episodes
      seasonYear
      relations {
        edges {
          relationType
          node {
            id
            title { romaji english native }
            coverImage { large }
            format
            episodes
            seasonYear
          }
        }
      }
    }
  }
}`;

type RelationsPage = {
  Page?: {
    media?: (Omit<AniListMedia, "nextAiringEpisode"> & {
      relations?: { edges?: { relationType: string; node: AniListRelation["node"] }[] | null } | null;
    })[];
  };
};

/**
 * Relations for a set of media, batched 50 at a time.
 *
 * Fetched on its own rather than added to `MEDIA_FIELDS`: the franchises view
 * is the only consumer, and relations roughly double the response size for
 * every other fetch (search, roulette, the airings refresh) for data they would
 * throw away. Relations never land on a `WatchlistEntry`, so the synced JSONB
 * payload is unchanged.
 */
export async function fetchMediaRelations(
  ids: number[],
  signal?: AbortSignal,
): Promise<Map<number, AniListRelation[]>> {
  const out = new Map<number, AniListRelation[]>();
  if (ids.length === 0) return out;
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await anilistData<RelationsPage>(
      RELATIONS_GQL,
      { ids: chunk },
      signal,
    );
    for (const m of data.Page?.media ?? []) {
      const edges = m.relations?.edges ?? [];
      out.set(
        m.id,
        edges
          .filter((e) => e && typeof e.relationType === "string")
          .map((e) => ({ type: e.relationType as AniListRelationType, node: e.node })),
      );
    }
  }
  return out;
}

export async function fetchRoulettePool(options: {
  genre?: string | null;
  format?: RouletteFormatFilter;
  mode?: RouletteDiscoveryMode;
  targetSize?: number;
  signal?: AbortSignal;
}): Promise<AniListMedia[]> {
  const target = options.targetSize ?? 50;
  const genre = options.genre && options.genre !== "Tous" ? options.genre : null;
  const format = options.format ?? "all";
  const formatIn = format === "all" ? null : ROULETTE_FORMATS[format];
  const mode = options.mode ?? "random";
  const signal = options.signal;

  const byId = new Map<number, AniListMedia>();

  const fetchPage = async (page: number, sort: string) => {
    const variables: Record<string, unknown> = {
      page,
      perPage: 50,
      sort: [sort],
    };
    if (genre) variables.genres = [genre];
    if (formatIn) variables.format_in = formatIn;
    const data = await anilistData<{
      Page?: {
        pageInfo?: { lastPage?: number; hasNextPage?: boolean };
        media?: AniListMedia[];
      };
    }>(ROULETTE_POOL_GQL, variables, signal);
    return {
      media: data.Page?.media ?? [],
      lastPage: data.Page?.pageInfo?.lastPage ?? 1,
    };
  };

  if (mode !== "random") {
    // Trending / Popular: walk the first pages of that single ranking only —
    // no random page jumps, so the pool stays genuinely top-ranked.
    const sort = DISCOVERY_MODE_SORT[mode];
    const pagesNeeded = Math.max(1, Math.ceil(target / 50));
    for (let page = 1; page <= pagesNeeded; page++) {
      try {
        const batch = await fetchPage(page, sort);
        for (const m of batch.media) byId.set(m.id, m);
        if (batch.media.length === 0) break;
      } catch {
        // ignore individual page failures; keep what we have
      }
    }
    // Shuffle client-side so the reel doesn't just spin in ranking order —
    // it's still a roulette, just drawn from a trending/popular shortlist.
    const ranked = [...byId.values()];
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!];
    }
    return ranked.slice(0, Math.min(Math.max(target, 50), ranked.length));
  }

  // First probe page to learn lastPage for this filter set
  const probeSort = ROULETTE_SORTS[Math.floor(Math.random() * ROULETTE_SORTS.length)]!;
  const probe = await fetchPage(1, probeSort);
  for (const m of probe.media) byId.set(m.id, m);
  const lastPage = Math.max(1, probe.lastPage);

  // Pull several random pages with varied sorts until we have enough (~50)
  const attempts = Math.min(8, Math.max(3, Math.ceil(target / 20)));
  const usedPages = new Set<number>([1]);
  for (let i = 0; i < attempts && byId.size < target; i++) {
    let page = 1 + Math.floor(Math.random() * lastPage);
    let guard = 0;
    while (usedPages.has(page) && usedPages.size < lastPage && guard < 8) {
      page = 1 + Math.floor(Math.random() * lastPage);
      guard++;
    }
    usedPages.add(page);
    const sort = ROULETTE_SORTS[Math.floor(Math.random() * ROULETTE_SORTS.length)]!;
    try {
      const batch = await fetchPage(page, sort);
      for (const m of batch.media) byId.set(m.id, m);
    } catch {
      // ignore individual page failures; keep what we have
    }
  }

  const all = [...byId.values()];
  // Fisher–Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, Math.min(Math.max(target, 50), all.length));
}


export function fetchBySeason(
  season: AniListSeason,
  seasonYear: number,
  page = 1,
  signal?: AbortSignal,
): Promise<AniListMedia[]> {
  return fetchAniList(SEASON_GQL, { season, seasonYear, page }, signal);
}

/** Spec 4.3: show recommendations only if ≥ 5 rated or completed entries */
export function canShowRecommendations(entries: WatchlistEntry[]): boolean {
  const signal = entries.filter(
    (e) => e.rating != null || e.status === "Completed",
  ).length;
  return signal >= 5;
}

export async function fetchAniList(
  gql: string,
  variables: Record<string, unknown> | undefined,
  signal?: AbortSignal,
): Promise<AniListMedia[]> {
  const data = await anilistData<{ Page?: { media?: AniListMedia[] } }>(
    gql,
    variables || {},
    signal,
  );
  return data.Page?.media || [];
}

export const searchAniListQuery = (q: string, signal?: AbortSignal) =>
  fetchAniList(SEARCH_GQL, { search: q }, signal);
export const fetchTrending = (signal?: AbortSignal) => fetchAniList(TRENDING_GQL, {}, signal);

/** Batch-fetch media by AniList ids (chunks of 50). Used to refresh nextAiring. */
export async function fetchMediaByIds(
  ids: number[],
  signal?: AbortSignal,
): Promise<AniListMedia[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const results: AniListMedia[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const page = await fetchAniList(MEDIA_BY_IDS_GQL, { ids: chunk }, signal);
    results.push(...page);
  }
  return results;
}

export async function fetchMediaById(id: number, signal?: AbortSignal): Promise<AniListMedia> {
  const data = await anilistData<{ Media?: AniListMedia }>(MEDIA_BY_ID_GQL, { id }, signal);
  if (!data.Media) throw new Error("Anime introuvable sur AniList");
  return data.Media;
}

/** Full detail payload for the entry modal (synopsis, trailer, banner…). */
export async function fetchMediaDetailById(
  id: number,
  signal?: AbortSignal,
): Promise<AniListMediaDetail> {
  const data = await anilistData<{ Media?: AniListMediaDetail }>(
    MEDIA_BY_ID_DETAIL_GQL,
    { id },
    signal,
  );
  if (!data.Media) throw new Error("Anime introuvable sur AniList");
  return data.Media;
}

/** Strip AniList spoiler markers and residual HTML from a synopsis. */
export function plainSynopsis(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/~![\s\S]*?!~/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function trailerWatchUrl(
  trailer: { id: string | null; site: string | null } | null | undefined,
): string | null {
  if (!trailer?.id || !trailer.site) return null;
  const site = trailer.site.toLowerCase();
  if (site === "youtube") return `https://www.youtube.com/watch?v=${trailer.id}`;
  if (site === "dailymotion") return `https://www.dailymotion.com/video/${trailer.id}`;
  return null;
}

export function trailerEmbedUrl(
  trailer: { id: string | null; site: string | null } | null | undefined,
): string | null {
  if (!trailer?.id || !trailer.site) return null;
  const site = trailer.site.toLowerCase();
  if (site === "youtube") return `https://www.youtube.com/embed/${trailer.id}`;
  if (site === "dailymotion") return `https://www.dailymotion.com/embed/video/${trailer.id}`;
  return null;
}

export const TRENDING_KEY = "__trending__";
export const CACHE_LIMIT = 100;
export const SEARCH_DEBOUNCE_MS = 180;

export function collectFacets(entries: WatchlistEntry[]) {
  const genres = new Set<string>();
  const years = new Set<number>();
  const studios = new Set<string>();
  const tags = new Set<string>();
  const people = new Set<string>();
  for (const e of entries) {
    for (const g of e.genres) genres.add(g);
    if (e.year) years.add(e.year);
    if (e.studio) studios.add(e.studio);
    for (const t of e.tags) tags.add(t);
    for (const p of e.withPeople || []) people.add(p);
  }
  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b, "fr")),
    years: [...years].sort((a, b) => b - a),
    studios: [...studios].sort((a, b) => a.localeCompare(b, "fr")),
    tags: [...tags].sort((a, b) => a.localeCompare(b, "fr")),
    people: [...people].sort((a, b) => a.localeCompare(b, "fr")),
  };
}

export type ListFilters = {
  status: StatusKey | "Tous";
  query: string;
  genres: string[];
  years: number[];
  studios: string[];
  tags: string[];
  people: string[];
};

export function filterEntries(entries: WatchlistEntry[], f: ListFilters): WatchlistEntry[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.status !== "Tous" && e.status !== f.status) return false;
    if (f.genres.length && !f.genres.some((g) => e.genres.includes(g))) return false;
    if (f.years.length && (e.year == null || !f.years.includes(e.year))) return false;
    if (f.studios.length && !f.studios.includes(e.studio)) return false;
    if (f.tags.length && !f.tags.some((t) => e.tags.includes(t))) return false;
    if (f.people?.length && !f.people.some((p) => (e.withPeople || []).includes(p))) return false;
    if (q) {
      const hay = `${e.title} ${e.tags.join(" ")} ${(e.withPeople || []).join(" ")} ${e.comment}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeStats(entries: WatchlistEntry[]) {
  const episodesWatched = entries.reduce((sum, e) => sum + (e.progress || 0), 0);
  const rated = entries.filter((e) => e.rating != null);
  const avgRating =
    rated.length === 0
      ? null
      : rated.reduce((sum, e) => sum + (e.rating || 0), 0) / rated.length;
  const genreCounts = new Map<string, number>();
  for (const e of entries) {
    for (const g of e.genres) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, 5);
  return {
    total: entries.length,
    episodesWatched,
    avgRating,
    ratedCount: rated.length,
    topGenres,
  };
}

export function technicalFieldsFromMedia(media: AniListMedia): Partial<WatchlistEntry> {
  const now = new Date().toISOString();
  return {
    title: mediaTitle(media),
    image: media.coverImage?.large || null,
    bannerImage: media.bannerImage || null,
    totalEpisodes: media.episodes ?? null,
    genres: media.genres || [],
    year: media.seasonYear ?? null,
    studio: media.studios?.nodes?.[0]?.name || "",
    format: media.format ?? null,
    airingStatus: media.status ?? null,
    airingEndedOn: airingEndDate(media.endDate),
    nextAiring: media.nextAiringEpisode
      ? {
          airingAt: media.nextAiringEpisode.airingAt,
          episode: media.nextAiringEpisode.episode,
          fetchedAt: now,
        }
      : null,
  };
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

const MEDIA_BY_MAL_GQL = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${MEDIA_FIELDS} } }`;

export async function fetchMediaByMalId(
  idMal: number,
  signal?: AbortSignal,
): Promise<AniListMedia | null> {
  // Best effort by design: a MAL id AniList does not know must not break the
  // import, so every GraphQL/HTTP failure resolves to null rather than throwing.
  const json = await anilistGraphql<{ Media?: AniListMedia }>(
    MEDIA_BY_MAL_GQL,
    { idMal },
    signal,
    { tolerant: true },
  );
  if (json.errors) return null;
  return json.data?.Media ?? null;
}
