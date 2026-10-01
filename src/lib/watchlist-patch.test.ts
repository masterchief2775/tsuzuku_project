import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PATCH_ENTRIES,
  mergeWatchlistPatch,
  normalizeEntries,
  sanitizePatchEntries,
} from "./watchlist-patch.ts";
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

describe("normalizeEntries", () => {
  it("returns [] for null/undefined", () => {
    assert.deepEqual(normalizeEntries(null), []);
    assert.deepEqual(normalizeEntries(undefined), []);
  });
  it("parses double-encoded JSONB strings", () => {
    const e = entry({ id: "a", anilistId: 1 });
    assert.deepEqual(normalizeEntries(JSON.stringify([e])), [e]);
  });
  it("returns [] for garbage strings and non-arrays", () => {
    assert.deepEqual(normalizeEntries("not json"), []);
    assert.deepEqual(normalizeEntries({ entries: [] }), []);
    assert.deepEqual(normalizeEntries(42), []);
  });
  it("passes arrays through", () => {
    const list = [entry({ id: "a", anilistId: 1 })];
    assert.equal(normalizeEntries(list), list);
  });
});

describe("sanitizePatchEntries", () => {
  it("throws for non-arrays", () => {
    assert.throws(() => sanitizePatchEntries({}), /must be an array/);
  });
  it("throws past the size cap", () => {
    const big = Array.from({ length: MAX_PATCH_ENTRIES + 1 }, (_, i) =>
      entry({ id: `id${i}`, anilistId: i + 1 }),
    );
    assert.throws(() => sanitizePatchEntries(big), /trop volumineux/);
  });
  it("throws for missing id or bad anilistId", () => {
    assert.throws(() => sanitizePatchEntries([{ anilistId: 1 }]), /id\/anilistId/);
    assert.throws(() => sanitizePatchEntries([{ id: "a", anilistId: -3 }]), /id\/anilistId/);
    assert.throws(() => sanitizePatchEntries(["nope"]), /Invalid patch entry/);
  });
  it("accepts valid entries", () => {
    const out = sanitizePatchEntries([entry({ id: "a", anilistId: 7 })]);
    assert.equal(out.length, 1);
  });
});

describe("mergeWatchlistPatch", () => {
  it("upserts by id and counts applied", () => {
    const current = [entry({ id: "a", anilistId: 1, progress: 1 })];
    const next = entry({ id: "a", anilistId: 1, progress: 5 });
    const { merged, applied } = mergeWatchlistPatch(current, [next], []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.progress, 5);
    assert.equal(applied, 1);
  });
  it("adds new ids and drops deleted ids", () => {
    const current = [entry({ id: "a", anilistId: 1 }), entry({ id: "b", anilistId: 2 })];
    const { merged, applied } = mergeWatchlistPatch(
      current,
      [entry({ id: "c", anilistId: 3 })],
      ["b"],
    );
    assert.deepEqual(
      merged.map((e) => e.id).sort(),
      ["a", "c"],
    );
    assert.equal(applied, 2);
  });
  it("collapses legacy anilistId duplicates to the newest", () => {
    const oldE = entry({ id: "old", anilistId: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    const newE = entry({ id: "new", anilistId: 1, updatedAt: "2026-02-01T00:00:00.000Z" });
    const { merged } = mergeWatchlistPatch([oldE], [newE], []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "new");
  });
  it("is a no-op for empty patches", () => {
    const current = [entry({ id: "a", anilistId: 1 })];
    const { merged, applied } = mergeWatchlistPatch(current, [], []);
    assert.equal(merged.length, 1);
    assert.equal(applied, 0);
  });
});
