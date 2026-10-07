import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRIVATE_ENTRY_FIELDS,
  PUBLIC_SHARE_FIELDS,
  shareCardTitle,
  toPublic,
} from "./share-public.ts";
import type { WatchlistEntry } from "./watchlist.ts";

/** An entry carrying every field `WatchlistEntry` declares, all filled with a
 *  recognisable value so a leak can be attributed. */
function richEntry(over: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: "entry-1",
    anilistId: 21,
    title: "One Piece",
    image: "https://example.test/cover.jpg",
    bannerImage: "https://example.test/banner.jpg",
    totalEpisodes: 1000,
    genres: ["Action", "Aventure"],
    year: 1999,
    studio: "Toei",
    format: "TV",
    status: "Watching",
    progress: 512,
    rating: 9,
    comment: "MON COMMENTAIRE PRIVE",
    tags: ["tag-prive-1", "tag-prive-2"],
    withPeople: ["user-ami-1", "user-ami-2"],
    addedAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2024-06-01T12:00:00.000Z",
    nextAiring: { airingAt: 1717243200, episode: 513, fetchedAt: "2024-06-01T00:00:00.000Z" },
    ...over,
  };
}

describe("toPublic — confidentiality boundary", () => {
  it("exposes exactly the allow-list and nothing else", () => {
    const [pub] = toPublic([richEntry()]);
    assert.deepEqual(
      Object.keys(pub).sort(),
      [...PUBLIC_SHARE_FIELDS].sort(),
      "public projection must be a strict allow-list",
    );
  });

  it("never leaks private fields, whatever the entry contains", () => {
    const [pub] = toPublic([richEntry()]);
    const serialised = JSON.stringify(pub);
    for (const field of PRIVATE_ENTRY_FIELDS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(pub, field),
        false,
        `private field "${field}" must not be present on a public share entry`,
      );
    }
    // And no private VALUE survives serialisation either (defence in depth:
    // a nested object would not show up in the key check above).
    for (const secret of [
      "MON COMMENTAIRE PRIVE",
      "tag-prive-1",
      "user-ami-1",
      "entry-1",
      "2024-06-01T12:00:00.000Z",
      "bannER".replace("bannER", "banner"),
      "1717243200",
      "Aventure",
    ]) {
      assert.equal(serialised.includes(secret), false, `public share leaked "${secret}"`);
    }
  });

  it("keeps every allowed field, including nulls and falsy values", () => {
    const [pub] = toPublic([
      richEntry({ image: null, rating: null, year: null, progress: 0, format: null }),
    ]);
    assert.equal(pub.image, null);
    assert.equal(pub.rating, null);
    assert.equal(pub.year, null);
    assert.equal(pub.progress, 0, "0 must survive, not be dropped as falsy");
    assert.equal(pub.format, null);
    assert.equal(pub.title, "One Piece");
    assert.equal(pub.totalEpisodes, 1000);
  });

  it("does not leak across a mixed batch", () => {
    const rows = toPublic([richEntry(), richEntry({ id: "entry-2", comment: "AUTRE SECRET" })]);
    assert.equal(rows.length, 2);
    const serialised = JSON.stringify(rows);
    assert.equal(serialised.includes("MON COMMENTAIRE PRIVE"), false);
    assert.equal(serialised.includes("AUTRE SECRET"), false);
    assert.equal(serialised.includes("entry-2"), false);
  });

  it("handles an empty list", () => {
    assert.deepEqual(toPublic([]), []);
  });
});

describe("shareCardTitle", () => {
  it("falls back to a generic label with no data", () => {
    assert.equal(shareCardTitle(null), "Liste partagée · Tsuzuku");
  });

  it("pluralises the count", () => {
    assert.equal(
      shareCardTitle({ entries: [], count: 1, ownerName: null }),
      "Liste partagée — 1 titre · Tsuzuku",
    );
    assert.equal(
      shareCardTitle({ entries: [], count: 3, ownerName: null }),
      "Liste partagée — 3 titres · Tsuzuku",
    );
  });

  it("names the owner when known", () => {
    assert.equal(
      shareCardTitle({ entries: [], count: 2, ownerName: "Sora" }),
      "Liste de Sora — 2 titres · Tsuzuku",
    );
  });
});