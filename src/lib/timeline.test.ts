import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSUMED_EPISODE_INTERVAL_DAYS,
  buildTimeline,
  estimateEnd,
  finishedCount,
  openEndedCount,
  sortTimeline,
  stillAiringCount,
  totalRemaining,
} from "./timeline.ts";
import type { WatchlistEntry } from "./watchlist.ts";

const DAY = 86400;
const NOW = 1_800_000_000; // fixed clock: 2027-01-15T08:00:00Z

function entry(over: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: "e1",
    anilistId: 1,
    title: "Série",
    image: null,
    totalEpisodes: 12,
    genres: [],
    year: 2026,
    studio: "",
    format: "TV",
    status: "Watching",
    progress: 3,
    rating: null,
    comment: "",
    tags: [],
    withPeople: [],
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextAiring: { airingAt: NOW + 2 * DAY, episode: 4, fetchedAt: "" },
    ...over,
  };
}

describe("estimateEnd", () => {
  it("projects from the next airing plus the remaining intervals", () => {
    // 9 episodes left, next one in 2 days, weekly => +8 weeks
    const end = estimateEnd(NOW + 2 * DAY, 9, NOW);
    assert.equal(end, NOW + 2 * DAY + 8 * 7 * DAY);
  });

  it("returns the next airing when nothing is left to watch", () => {
    assert.equal(estimateEnd(NOW + DAY, 0, NOW), NOW + DAY);
    assert.equal(estimateEnd(NOW + DAY, -3, NOW), NOW + DAY);
  });

  it("cannot project an open-ended series or an unscheduled one", () => {
    assert.equal(estimateEnd(NOW + DAY, null, NOW), null, "unknown total");
    assert.equal(estimateEnd(null, 9, NOW), null, "nothing scheduled");
    assert.equal(estimateEnd(0, 9, NOW), null, "sentinel airingAt 0");
  });

  it("honours a custom cadence", () => {
    assert.equal(estimateEnd(NOW, 5, NOW, 14), NOW + 4 * 14 * DAY);
  });
});

describe("buildTimeline — finished series", () => {
  // Black Clover (AniList id 97940) for real: FINISHED, 170 episodes,
  // nextAiringEpisode null, endDate 2021-03-30.
  const blackClover = entry({
    id: "bc",
    anilistId: 97940,
    title: "Black Clover",
    totalEpisodes: 170,
    progress: 0,
    airingStatus: "FINISHED",
    airingEndedOn: "2021-03-30",
    nextAiring: { airingAt: 0, episode: 0, fetchedAt: "" },
  });

  it("reports a finished series as finished, not as an unknown broadcast", () => {
    const rows = buildTimeline([blackClover], NOW);
    const row = rows[0]!;
    assert.equal(row.airingFinished, true);
    // The bug: with a null next airing and no status, this looked identical to a
    // series we simply had no data for, and the UI said "diffusion inconnue".
    assert.equal(row.estimatedEndAt, null);
    assert.equal(row.nextAiringAt, null);
    assert.equal(row.remaining, 170);
  });

  it("carries the real end date instead of projecting one", () => {
    const row = buildTimeline([blackClover], NOW)[0]!;
    assert.equal(row.endedAt, Date.parse("2021-03-30T00:00:00Z") / 1000);
    // A series that is over never gets a *future* projection.
    assert.equal(row.daysLeft, null);
  });

  it("still calls a finished series open-ended when AniList has no total", () => {
    const row = buildTimeline(
      [entry({ id: "x", totalEpisodes: null, airingStatus: "FINISHED", nextAiring: { airingAt: 0, episode: 0, fetchedAt: "" } })],
      NOW,
    )[0]!;
    assert.equal(row.openEnded, true);
    assert.equal(row.airingFinished, true);
    assert.equal(row.endedAt, null);
  });

  it("treats a cancelled series as finished", () => {
    const row = buildTimeline([entry({ airingStatus: "CANCELLED" })], NOW)[0]!;
    assert.equal(row.airingFinished, true);
    assert.equal(row.estimatedEndAt, null);
  });

  it("keeps projecting a series that is still releasing", () => {
    const row = buildTimeline([entry({ airingStatus: "RELEASING" })], NOW)[0]!;
    assert.equal(row.airingFinished, false);
    assert.equal(row.estimatedEndAt, NOW + 2 * DAY + 8 * 7 * DAY);
  });

  it("keeps the old behaviour for entries stored before the field existed", () => {
    // `airingStatus === undefined` must read as "unknown", never as finished.
    const row = buildTimeline([entry({ airingStatus: undefined })], NOW)[0]!;
    assert.equal(row.airingFinished, false);
    assert.equal(row.estimatedEndAt, NOW + 2 * DAY + 8 * 7 * DAY);
  });

  it("drops a finished series the user has already watched to the end", () => {
    const rows = buildTimeline(
      [entry({ id: "done", airingStatus: "FINISHED", progress: 12, totalEpisodes: 12 })],
      NOW,
    );
    assert.deepEqual(rows, []);
  });

  it("counts finished and still-airing series separately", () => {
    const rows = buildTimeline(
      [
        blackClover,
        entry({ id: "live", airingStatus: "RELEASING" }),
        entry({ id: "unknown", airingStatus: undefined }),
      ],
      NOW,
    );
    assert.equal(rows.length, 3);
    assert.equal(finishedCount(rows), 1);
    assert.equal(stillAiringCount(rows), 2);
  });

  it("sorts the projected ends first, then finished ones, then unknown", () => {
    const rows = buildTimeline(
      [
        entry({ id: "unknown", airingStatus: undefined, nextAiring: { airingAt: 0, episode: 0, fetchedAt: "" } }),
        blackClover,
        entry({ id: "live", airingStatus: "RELEASING" }),
      ],
      NOW,
    );
    assert.deepEqual(sortTimeline(rows, "end").map((r) => r.id), ["live", "bc", "unknown"]);
  });
});

describe("buildTimeline", () => {
  it("keeps only watching entries", () => {
    const rows = buildTimeline(
      [
        entry({ id: "a" }),
        entry({ id: "b", status: "Plan to Watch" }),
        entry({ id: "c", status: "Completed" }),
        entry({ id: "d", status: "On Hold" }),
      ],
      NOW,
    );
    assert.deepEqual(rows.map((r) => r.id), ["a"]);
  });

  it("computes remaining, ratio and end date", () => {
    const [row] = buildTimeline([entry()], NOW);
    assert.equal(row.total, 12);
    assert.equal(row.progress, 3);
    assert.equal(row.remaining, 9);
    assert.equal(row.openEnded, false);
    assert.equal(row.progressRatio, 3 / 12);
    assert.equal(row.estimatedEndAt, NOW + 2 * DAY + 8 * 7 * DAY);
    assert.equal(row.nextEpisode, 4);
    assert.equal(row.daysLeft, 58);
  });

  it("flags an ongoing series with no announced total as open-ended", () => {
    const [row] = buildTimeline([entry({ totalEpisodes: null })], NOW);
    assert.equal(row.openEnded, true);
    assert.equal(row.remaining, null);
    assert.equal(row.estimatedEndAt, null);
    assert.equal(row.progressRatio, null);
    assert.equal(row.daysLeft, null);
  });

  it("treats the airingAt 0 sentinel as 'nothing scheduled', not as 1970", () => {
    const [row] = buildTimeline([entry({ nextAiring: { airingAt: 0, episode: 0, fetchedAt: "" } })], NOW);
    assert.equal(row.nextAiringAt, null);
    assert.equal(row.estimatedEndAt, null);
  });

  it("tolerates a missing nextAiring", () => {
    const [row] = buildTimeline([entry({ nextAiring: null })], NOW);
    assert.equal(row.nextAiringAt, null);
    assert.equal(row.nextEpisode, null);
  });

  it("never produces a negative remaining for an over-watched entry", () => {
    const [row] = buildTimeline([entry({ progress: 20, totalEpisodes: 12 })], NOW);
    assert.equal(row.remaining, 0);
    assert.equal(row.progressRatio, 1);
  });
});

describe("sortTimeline", () => {
  const rows = buildTimeline(
    [
      entry({ id: "open", title: "A rallonge", totalEpisodes: null }),
      entry({ id: "far", title: "Loin", progress: 1, totalEpisodes: 12, nextAiring: { airingAt: NOW + 60 * DAY, episode: 2, fetchedAt: "" } }),
      entry({ id: "soon", title: "Bientôt", progress: 11, totalEpisodes: 12, nextAiring: { airingAt: NOW + DAY, episode: 12, fetchedAt: "" } }),
    ],
    NOW,
  );

  it("puts the soonest-ending series first and open-ended last", () => {
    const sorted = sortTimeline(rows, "end");
    assert.deepEqual(sorted.map((r) => r.id), ["soon", "far", "open"]);
  });

  it("sorts by next airing, unscheduled last", () => {
    const unscheduled = buildTimeline([entry({ id: "none", nextAiring: null })], NOW);
    const sorted = sortTimeline([...rows, ...unscheduled], "next");
    assert.equal(sorted[sorted.length - 1]?.id, "none");
    assert.equal(sorted[0]?.id, "soon");
  });

  it("sorts by remaining, unknown totals last", () => {
    const sorted = sortTimeline(rows, "remaining");
    assert.equal(sorted[sorted.length - 1]?.id, "open");
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.id);
    sortTimeline(rows, "end");
    assert.deepEqual(rows.map((r) => r.id), before);
  });
});

describe("aggregates", () => {
  it("sums remaining and counts open-ended", () => {
    const rows = buildTimeline(
      [
        entry({ id: "a", progress: 3, totalEpisodes: 12 }),
        entry({ id: "b", progress: 5, totalEpisodes: 24 }),
        entry({ id: "c", totalEpisodes: null }),
      ],
      NOW,
    );
    assert.equal(totalRemaining(rows), 9 + 19);
    assert.equal(openEndedCount(rows), 1);
  });
});

describe("cadence assumption", () => {
  it("is a documented weekly default, not a measured value", () => {
    // AniList exposes no airing schedule, so this stays an assumption until the
    // app records observed intervals. Guard the value so it cannot drift silently.
    assert.equal(ASSUMED_EPISODE_INTERVAL_DAYS, 7);
  });
});