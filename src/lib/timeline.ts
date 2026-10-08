import { hasFinishedAiring, type WatchlistEntry } from "./watchlist.ts";

/**
 * Season timeline — when will this actually end?
 *
 * Built **entirely from the store** (`status`, `progress`, `totalEpisodes`,
 * `nextAiring`, all already refreshed periodically). No extra AniList call: the
 * API is capped at ~90 req/min with no key here, and every render currently
 * re-reads what it has.
 *
 * The cadence below is an ASSUMPTION, not a measurement: AniList exposes only
 * `nextAiringEpisode`, never a schedule, so a true per-series interval cannot be
 * derived from one data point. It is a named constant so the estimate is honest
 * in the UI and swappable later (e.g. from observed airings) without touching
 * this logic.
 */

/** Days between two episodes, assuming the near-universal weekly cour. */
export const ASSUMED_EPISODE_INTERVAL_DAYS = 7;

const DAY = 86400;

export type TimelineRow = {
  id: string;
  anilistId: number;
  title: string;
  image: string | null;
  /** Episode the entry is on. */
  progress: number;
  /** Known total, or null for ongoing series with no announced end (One Piece). */
  total: number | null;
  /** total - progress, or null when the total is unknown. */
  remaining: number | null;
  /** Unix seconds of the next known episode; null when nothing is scheduled. */
  nextAiringAt: number | null;
  nextEpisode: number | null;
  /** Unix seconds of the projected last episode; null when unknowable. */
  estimatedEndAt: number | null;
  /**
   * True when AniList says the series is over (FINISHED or CANCELLED). This is
   * what separates "nothing is airing because it ended" from "nothing is airing
   * and we do not know why": both have a null `nextAiringAt`, but only one is a
   * finished series, and Black Clover is emphatically not an unknown broadcast.
   */
  airingFinished: boolean;
  /** Unix seconds of the series' last day, when AniList records a full date. */
  endedAt: number | null;
  /** true when the series has no announced total — the "never finishes" case. */
  openEnded: boolean;
  /** 0..1, null when the total is unknown. */
  progressRatio: number | null;
  /** Whole days until the projected end; null when unknowable. */
  daysLeft: number | null;
};

/** "YYYY-MM-DD" as unix seconds, or null when absent/incomplete. */
function parseIsoDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Projects when a series will finish, from the next airing and the number of
 * episodes left. `nowSec` is injected so the result is deterministic in tests.
 */
export function estimateEnd(
  nextAiringAt: number | null,
  remaining: number | null,
  nowSec: number,
  intervalDays = ASSUMED_EPISODE_INTERVAL_DAYS,
): number | null {
  if (nextAiringAt == null || nextAiringAt <= 0) return null;
  if (remaining == null) return null;
  if (remaining <= 0) return nextAiringAt;
  // The next airing IS episode `remaining` from the end when the entry is fully
  // caught up: remaining-1 more intervals after it.
  return nextAiringAt + (remaining - 1) * intervalDays * DAY;
}

export function buildTimeline(
  entries: WatchlistEntry[],
  nowSec: number = Math.floor(Date.now() / 1000),
  intervalDays = ASSUMED_EPISODE_INTERVAL_DAYS,
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const e of entries) {
    if (e.status !== "Watching") continue;
    // A series that ended AND that the user has fully watched has nothing left to
    // project and nothing left to air: keeping it would only add a row that
    // answers nothing.
    if (hasFinishedAiring(e.airingStatus) && e.totalEpisodes != null && e.progress >= e.totalEpisodes) {
      continue;
    }
    const at = e.nextAiring?.airingAt ?? null;
    const nextEpisode =
      e.nextAiring && e.nextAiring.episode > 0 ? e.nextAiring.episode : null;
    // "Sentinel" airingAt 0 means "checked, nothing upcoming" — not a schedule.
    const nextAiringAt = at != null && at > 0 ? at : null;

    const total = typeof e.totalEpisodes === "number" && e.totalEpisodes > 0 ? e.totalEpisodes : null;
    const progress = Math.max(0, e.progress || 0);
    const remaining = total == null ? null : Math.max(0, total - progress);
    const openEnded = total == null;
    const airingFinished = hasFinishedAiring(e.airingStatus);
    const estimatedEndAt = estimateEnd(nextAiringAt, remaining, nowSec, intervalDays);
    // A finished series has a real, known last day; never project one for it.
    const endedAt = airingFinished ? parseIsoDate(e.airingEndedOn) : null;

    rows.push({
      id: e.id,
      anilistId: e.anilistId,
      title: e.title,
      image: e.image,
      progress,
      total,
      remaining,
      nextAiringAt,
      nextEpisode,
      estimatedEndAt: airingFinished ? null : estimatedEndAt,
      airingFinished,
      endedAt,
      openEnded,
      progressRatio: total == null || total <= 0 ? null : Math.min(1, progress / total),
      daysLeft:
        estimatedEndAt == null ? null : Math.max(0, Math.round((estimatedEndAt - nowSec) / DAY)),
    });
  }

  return rows;
}

export type TimelineSort = "end" | "remaining" | "next";

/**
 * Sorts so the actionable rows come first: series that will actually finish
 * soonest, then open-ended ones. Open-ended series have no end date at all, so
 * leaving them scattered would make the chart meaningless.
 */
export function sortTimeline(rows: TimelineRow[], sort: TimelineSort): TimelineRow[] {
  const copy = [...rows];
  if (sort === "remaining") {
    // Unknown totals last; longest remaining first.
    copy.sort((a, b) => {
      if (a.remaining == null && b.remaining == null) return a.title.localeCompare(b.title);
      if (a.remaining == null) return 1;
      if (b.remaining == null) return -1;
      return b.remaining - a.remaining;
    });
    return copy;
  }
  if (sort === "next") {
    copy.sort((a, b) => {
      if (a.nextAiringAt == null && b.nextAiringAt == null) return 0;
      if (a.nextAiringAt == null) return 1;
      if (b.nextAiringAt == null) return -1;
      return a.nextAiringAt - b.nextAiringAt;
    });
    return copy;
  }
  copy.sort((a, b) => {
    // Rows we can project come first, soonest end at the top.
    if (a.estimatedEndAt != null && b.estimatedEndAt != null) return a.estimatedEndAt - b.estimatedEndAt;
    if (a.estimatedEndAt != null) return -1;
    if (b.estimatedEndAt != null) return 1;
    // Then finished series, which have a real date: most recently ended first.
    if (a.airingFinished !== b.airingFinished) return a.airingFinished ? -1 : 1;
    if (a.endedAt != null && b.endedAt != null) return b.endedAt - a.endedAt;
    return a.title.localeCompare(b.title);
  });
  return copy;
}

/** Total episodes still to watch across rows with a known total. */
export function totalRemaining(rows: TimelineRow[]): number {
  return rows.reduce((sum, r) => sum + (r.remaining ?? 0), 0);
}

/** How many series cannot be projected to a finish. */
export function openEndedCount(rows: TimelineRow[]): number {
  return rows.filter((r) => r.openEnded).length;
}

/** How many series are still broadcasting: the ones a "when does it end" list is about. */
export function stillAiringCount(rows: TimelineRow[]): number {
  return rows.filter((r) => !r.airingFinished).length;
}

/** How many series are over, so their rows are about catching up rather than waiting. */
export function finishedCount(rows: TimelineRow[]): number {
  return rows.filter((r) => r.airingFinished).length;
}
