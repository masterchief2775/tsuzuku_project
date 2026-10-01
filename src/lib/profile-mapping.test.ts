import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapRow,
  normalizeVisibility,
  parseFavorites,
  profileCardTitle,
  sanitizeFavorites,
  sanitizeUrl,
} from "./profile-mapping.ts";
import type { ProfileRow } from "./profile.ts";

function row(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "u1",
    username: "sacha",
    display_name: "Sacha",
    bio: "hello",
    avatar_url: null,
    is_public: true,
    name: "Sacha",
    email: "sacha@example.com",
    image: null,
    ...over,
  };
}

describe("parseFavorites / sanitizeFavorites", () => {
  it("returns [] for non-arrays", () => {
    assert.deepEqual(parseFavorites(null), []);
    assert.deepEqual(parseFavorites("x"), []);
  });
  it("drops invalid items and caps at 5", () => {
    const raw = [
      { anilistId: 1, title: "A", image: null },
      { anilistId: -2, title: "Bad" },
      { anilistId: 3, title: "" },
      { anilistId: 4 },
      ...[5, 6, 7, 8, 9, 10].map((n) => ({ anilistId: n, title: `T${n}` })),
    ];
    const out = sanitizeFavorites(raw);
    assert.equal(out.length, 5);
    assert.equal(out[0]?.anilistId, 1);
  });
  it("slices long titles", () => {
    const out = parseFavorites([{ anilistId: 1, title: "x".repeat(500) }]);
    assert.equal(out[0]?.title.length, 200);
  });
});

describe("normalizeVisibility", () => {
  it("keeps explicit values", () => {
    assert.equal(normalizeVisibility(row({ visibility: "friends" })), "friends");
  });
  it("falls back to is_public", () => {
    assert.equal(normalizeVisibility(row({ visibility: null, is_public: true })), "public");
    assert.equal(normalizeVisibility(row({ visibility: null, is_public: false })), "private");
    assert.equal(normalizeVisibility(row({})), "public");
  });
});

describe("mapRow", () => {
  it("maps fallbacks and hides email from non-owners", () => {
    const pub = mapRow(row({ display_name: null, name: null, bio: "", avatar_url: null }));
    assert.equal(pub.displayName, "sacha");
    assert.equal(pub.bio, "");
    assert.equal(pub.avatarUrl, null);
    assert.equal(pub.email, undefined);
    assert.deepEqual(pub.favorites, []);
  });
  it("exposes email and stats to the owner", () => {
    const pub = mapRow(row(), { isOwner: true, listCount: 3, stats: null });
    assert.equal(pub.email, "sacha@example.com");
    assert.equal(pub.listCount, 3);
  });
  it("derives isPublic from visibility", () => {
    assert.equal(mapRow(row({ visibility: "private", is_public: false })).isPublic, false);
  });
});

describe("profileCardTitle", () => {
  it("names the owner, handles missing and loading states", () => {
    const pub = mapRow(row());
    assert.equal(profileCardTitle(pub, "sacha"), "Sacha (@sacha) · Tsuzuku");
    assert.equal(profileCardTitle(null, "sacha"), "Profil introuvable · Tsuzuku");
    assert.equal(profileCardTitle(undefined, "sacha"), "@sacha · Tsuzuku");
  });
});

describe("sanitizeUrl", () => {
  it("accepts allowlisted hosts and subdomains", () => {
    assert.equal(
      sanitizeUrl("https://anilist.co/user/x", ["anilist.co"]),
      "https://anilist.co/user/x",
    );
    assert.equal(
      sanitizeUrl("myanimelist.net/profile/x", ["myanimelist.net"]),
      "https://myanimelist.net/profile/x",
    );
  });
  it("rejects other hosts and protocols", () => {
    assert.throws(() => sanitizeUrl("https://evil.com/x", ["anilist.co"]), /non autorisée/);
    assert.throws(() => sanitizeUrl("ftp://anilist.co/x", ["anilist.co"]), /non autorisée/);
  });
  it("returns null for empty input", () => {
    assert.equal(sanitizeUrl(null, ["anilist.co"]), null);
    assert.equal(sanitizeUrl("   ", ["anilist.co"]), null);
  });
  it("throws for garbage", () => {
    assert.throws(() => sanitizeUrl("http://", ["anilist.co"]), /invalide/);
  });
});
