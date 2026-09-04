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
  /** People you watch this title with (co-watching) */
  withPeople: string[];
  addedAt: string;
  updatedAt: string;
  /** Cached next airing info (refreshed periodically for Watching entries) */
  nextAiring?: {
    airingAt: number;
    episode: number;
    fetchedAt: string;
  } | null;
};

export type NextAiringEpisode = {
  airingAt: number; // unix timestamp
  episode: number;
  timeUntilAiring: number; // seconds
};

export type AniListMedia = {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null; color: string | null } | null;
  episodes: number | null;
  genres: string[] | null;
  seasonYear: number | null;
  studios: { nodes: { name: string }[] } | null;
  averageScore: number | null;
  format: MediaFormat;
  nextAiringEpisode?: NextAiringEpisode | null;
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
  if (seconds <= 0) return `Ép. ${entry.nextAiring.episode} bientôt`;
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
    totalEpisodes: e.totalEpisodes ?? null,
    genres: e.genres || [],
    tags: e.tags || [],
    withPeople: e.withPeople || [],
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
    totalEpisodes: media.episodes ?? null,
    genres: media.genres || [],
    year: media.seasonYear ?? null,
    studio: media.studios?.nodes?.[0]?.name || "",
    format: media.format ?? null,
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
  episodes
  genres
  seasonYear
  format
  studios(isMain: true) { nodes { name } }
  averageScore
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
const GENRE_RECO_GQL = `query ($genres: [String], $perPage: Int) {
  Page(perPage: $perPage) {
    media(genre_in: $genres, type: ANIME, isAdult: false, sort: SCORE_DESC) { ${MEDIA_FIELDS} }
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

function aniListDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function fetchAniList(
  gql: string,
  variables: Record<string, unknown> | undefined,
  signal?: AbortSignal,
  attempt = 0,
): Promise<AniListMedia[]> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: gql, variables: variables || {} }),
    signal,
  });
  // AniList's public endpoint has a fairly low rate limit; a search-as-you-type
  // UI can realistically hit it. Back off using the server's own Retry-After
  // (falling back to a short exponential delay) instead of surfacing a raw
  // error on the first 429 — up to 2 retries.
  if (res.status === 429 && attempt < 2) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const parsed = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 1200 * (attempt + 1);
    await aniListDelay(waitMs, signal);
    return fetchAniList(gql, variables, signal, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("AniList a répondu " + res.status + " " + body.slice(0, 200));
  }
  const json = (await res.json()) as { errors?: { message: string }[]; data?: { Page?: { media?: AniListMedia[] } } };
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
  return json?.data?.Page?.media || [];
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

export async function fetchMediaById(
  id: number,
  signal?: AbortSignal,
  attempt = 0,
): Promise<AniListMedia> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: MEDIA_BY_ID_GQL, variables: { id } }),
    signal,
  });
  if (res.status === 429 && attempt < 2) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const parsed = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 1200 * (attempt + 1);
    await aniListDelay(waitMs, signal);
    return fetchMediaById(id, signal, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("AniList a répondu " + res.status + " " + body.slice(0, 200));
  }
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { Media?: AniListMedia };
  };
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
  if (!json.data?.Media) throw new Error("Anime introuvable sur AniList");
  return json.data.Media;
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
    totalEpisodes: media.episodes ?? null,
    genres: media.genres || [],
    year: media.seasonYear ?? null,
    studio: media.studios?.nodes?.[0]?.name || "",
    format: media.format ?? null,
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
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: MEDIA_BY_MAL_GQL, variables: { idMal } }),
    signal,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { Media?: AniListMedia };
  };
  if (json.errors || !json.data?.Media) return null;
  return json.data.Media;
}
