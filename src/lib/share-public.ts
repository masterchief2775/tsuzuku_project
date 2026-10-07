import type { StatusKey, WatchlistEntry } from "./watchlist.ts";

/**
 * Public-share projection — pure, with no server imports.
 *
 * Extracted from `share.ts` so it can be unit-tested: `share.ts` pulls in
 * `@/lib/db` and `@tanstack/react-start`, which cannot resolve outside the
 * bundler. Same reason `block-guards.ts` exists alongside `blocks.server.ts`.
 *
 * This is a confidentiality boundary: what a share link exposes to anonymous
 * visitors. It is an explicit allow-list on purpose — adding a field to
 * `WatchlistEntry` must never silently widen what a public link leaks.
 */

export type PublicShareEntry = {
  anilistId: number;
  title: string;
  image: string | null;
  totalEpisodes: number | null;
  format: string | null;
  status: StatusKey;
  progress: number;
  rating: number | null;
  year: number | null;
};

export type PublicSharePayload = {
  entries: PublicShareEntry[];
  count: number;
  /** Owner display name — feeds the share-card title (og:title via document title). */
  ownerName: string | null;
};

/** The exact fields a public share may expose. */
export const PUBLIC_SHARE_FIELDS = [
  "anilistId",
  "title",
  "image",
  "totalEpisodes",
  "format",
  "status",
  "progress",
  "rating",
  "year",
] as const;

/** Fields that must never reach a public share, whatever the entry contains. */
export const PRIVATE_ENTRY_FIELDS = [
  "id",
  "comment",
  "tags",
  "withPeople",
  "addedAt",
  "updatedAt",
  "nextAiring",
  "genres",
  "studio",
  "bannerImage",
] as const;

export function toPublic(entries: WatchlistEntry[]): PublicShareEntry[] {
  return entries.map((e) => ({
    anilistId: e.anilistId,
    title: e.title,
    image: e.image,
    totalEpisodes: e.totalEpisodes,
    format: e.format,
    status: e.status,
    progress: e.progress,
    rating: e.rating,
    year: e.year,
  }));
}

/** Card/tab title for a shared list (unit-tested). */
export function shareCardTitle(data: PublicSharePayload | null): string {
  if (!data) return "Liste partagée · Tsuzuku";
  const count = `${data.count} titre${data.count > 1 ? "s" : ""}`;
  return data.ownerName
    ? `Liste de ${data.ownerName} — ${count} · Tsuzuku`
    : `Liste partagée — ${count} · Tsuzuku`;
}