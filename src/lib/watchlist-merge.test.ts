import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localNewerThanRemote, mergeWatchlists } from "./watchlist-merge.ts";
import type { WatchlistEntry } from "./watchlist.ts";

function entry(over: Partial<WatchlistEntry> & { id: string; anilistId: number }): WatchlistEntry {
  return {
    title: "Titre",
    image: null,
    totalEpisodes: 12,
    genres: [],
    year: null,
    studio: "",
    format: "TV",
    status: "Watching",
    progress: 1,
    rating: null,
    comment: "",
    tags: [],
    withPeople: [],
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

describe("mergeWatchlists", () => {
  it("unions both sides by anilistId", () => {
    const merged = mergeWatchlists(
      [entry({ id: "l", anilistId: 1 })],
      [entry({ id: "r", anilistId: 2 })],
    );
    assert.deepEqual(
      merged.map((e) => e.anilistId).sort(),
      [1, 2],
    );
  });
  it("keeps the most recently updated on conflict", () => {
    const merged = mergeWatchlists(
      [entry({ id: "l", anilistId: 1, updatedAt: "2026-03-01T00:00:00.000Z" })],
      [entry({ id: "r", anilistId: 1, updatedAt: "2026-01-01T00:00:00.000Z" })],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "l");
  });
  it("sorts newest first", () => {
    const merged = mergeWatchlists(
      [entry({ id: "a", anilistId: 1, updatedAt: "2026-01-01T00:00:00.000Z" })],
      [entry({ id: "b", anilistId: 2, updatedAt: "2026-05-01T00:00:00.000Z" })],
    );
    assert.deepEqual(
      merged.map((e) => e.id),
      ["b", "a"],
    );
  });
});

describe("localNewerThanRemote", () => {
  it("flags entries missing server-side", () => {
    const local = [entry({ id: "l", anilistId: 9 })];
    assert.deepEqual(localNewerThanRemote(local, []), local);
  });
  it("flags same ids with a newer local updatedAt", () => {
    const local = [entry({ id: "l", anilistId: 1, updatedAt: "2026-06-01T00:00:00.000Z" })];
    const remote = [entry({ id: "r", anilistId: 1, updatedAt: "2026-01-01T00:00:00.000Z" })];
    assert.equal(localNewerThanRemote(local, remote).length, 1);
  });
  it("ignores entries the server already has newer", () => {
    const local = [entry({ id: "l", anilistId: 1, updatedAt: "2026-01-01T00:00:00.000Z" })];
    const remote = [entry({ id: "r", anilistId: 1, updatedAt: "2026-06-01T00:00:00.000Z" })];
    assert.deepEqual(localNewerThanRemote(local, remote), []);
  });
});
