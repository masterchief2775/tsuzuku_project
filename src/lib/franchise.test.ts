import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCuratedOrder,
  bridgeEndpointIds,
  bridgeRelationFor,
  buildFranchises,
  rankFranchises,
  splitMembersForDisplay,
  FRANCHISE_VISIBLE_CAP,
  type FranchiseMember,
  type MemberStatus,
} from "./franchise.ts";
import { CURATED_BRIDGES } from "./franchise-order.ts";
import type { AniListRelation } from "./watchlist.ts";

function node(id: number, title: string, extra: Partial<AniListRelation["node"]> = {}) {
  return {
    id,
    title: { romaji: title, english: null, native: null },
    coverImage: { large: null },
    format: "TV",
    episodes: null,
    seasonYear: null,
    ...extra,
  };
}

function media(
  id: number,
  title: string,
  relations: AniListRelation[],
  extra: Partial<FranchiseMember> = {},
): FranchiseMember {
  return {
    id,
    title,
    image: null,
    format: "TV",
    episodes: null,
    seasonYear: null,
    relations,
    ...extra,
  };
}

const none = () => null;

/** User has only these ids; everything else reads as missing. */
const has = (...ids: number[]) => {
  const set = new Set(ids);
  return (id: number): MemberStatus => (set.has(id) ? "Completed" : null);
};

describe("buildFranchises — grouping", () => {
  it("clusters connected media, however the edge is typed", () => {
    // SIDE_STORY carries no ordering information but still groups members.
    const f = buildFranchises({
      media: [
        media(1, "Alpha", [{ type: "PREQUEL", node: node(2, "Beta") }]),
        media(2, "Beta", [{ type: "SIDE_STORY", node: node(3, "Gamma") }]),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.equal(f.length, 1);
    assert.equal(f[0]?.members.length, 3);
  });

  it("keeps unrelated titles in separate franchises", () => {
    // A lone title with no relations is not a franchise, so only the connected
    // pair survives the default minSize of 2.
    const f = buildFranchises({
      media: [
        media(1, "Seul", [{ type: "PREQUEL", node: node(2, "Suite") }]),
        media(9, "Sans lien", []),
      ],
      statusOf: has(1, 9),
      curated: [],
    });
    assert.equal(f.length, 1);
    assert.equal(f[0]?.members.length, 2);
  });

  it("ignores singletons by default and honours minSize", () => {
    const mediaList = [media(1, "A", [{ type: "PREQUEL", node: node(2, "B") }]), media(9, "Solo", [])];
    assert.equal(buildFranchises({ media: mediaList, statusOf: none, curated: [] }).length, 1);
    assert.equal(
      buildFranchises({ media: mediaList, statusOf: none, minSize: 3, curated: [] }).length,
      0,
    );
  });
});

describe("buildFranchises — ordering", () => {
  it("puts a prequel before its sequel", () => {
    // 2 lists 1 as its SEQUEL, so 1 is LATER: 2 must come first.
    const f = buildFranchises({
      media: [
        media(2, "Suite", [{ type: "SEQUEL", node: node(1, "Origine") }]),
        media(1, "Origine", []),
      ],
      statusOf: has(1, 2),
      curated: [],
    });
    assert.deepEqual(f[0]?.members.map((m) => m.id), [2, 1]);
  });

  it("puts a PARENT before its derivative", () => {
    const f = buildFranchises({
      media: [
        media(2, "Spin-off", [{ type: "PARENT", node: node(1, "Oeuvre mere") }]),
        media(1, "Oeuvre mere", []),
      ],
      statusOf: has(1, 2),
      curated: [],
    });
    assert.deepEqual(f[0]?.members.map((m) => m.id), [1, 2]);
  });

  it("treats a summary as unordered, since a recap stands on its own", () => {
    // 2 lists 1 as its SUMMARY. That groups them but must not impose an order:
    // on the live API Cowboy Bebop's TV special is a summary of the movie, and
    // honouring it made owning the movie flag the special as a prerequisite.
    const f = buildFranchises({
      media: [
        media(2, "Recapitulatif", [{ type: "SUMMARY", node: node(1, "Original") }], { seasonYear: 2000 }),
        media(1, "Original", [], { seasonYear: 1999 }),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.equal(f[0]?.members.length, 2);
    // Unordered members fall back to release year, so the 1999 original leads.
    assert.deepEqual(f[0]?.members.map((m) => m.id), [1, 2]);
    assert.deepEqual(f[0]?.missingPrerequisites, []);
  });

  it("falls back to release year for members with no ordering edge", () => {
    const f = buildFranchises({
      media: [
        media(2, "Recent", [{ type: "SIDE_STORY", node: node(1, "Ancien") }], { seasonYear: 2019 }),
        media(1, "Ancien", [], { seasonYear: 2004 }),
      ],
      statusOf: has(1, 2),
      curated: [],
    });
    assert.deepEqual(f[0]?.members.map((m) => m.id), [1, 2]);
  });

  it("names the franchise after the earliest story, not the first added", () => {
    // Realistic shape: a later title lists its prequel. Tome 1 is the origin.
    const f = buildFranchises({
      media: [
        media(3, "Tome 3", [{ type: "PREQUEL", node: node(2, "Tome 2") }], { seasonYear: 2005 }),
        media(2, "Tome 2", [{ type: "PREQUEL", node: node(1, "Tome 1") }], { seasonYear: 2003 }),
        media(1, "Tome 1", [], { seasonYear: 2001 }),
      ],
      statusOf: has(1, 2, 3),
      curated: [],
    });
    assert.equal(f[0]?.name, "Tome 1");
    assert.deepEqual(f[0]?.members.map((m) => m.id), [1, 2, 3]);
  });

  it("does not hang on a cycle (AniList does contain them)", () => {
    const f = buildFranchises({
      media: [
        media(1, "A", [{ type: "SEQUEL", node: node(2, "B") }]),
        media(2, "B", [{ type: "SEQUEL", node: node(1, "A") }]),
      ],
      statusOf: has(1, 2),
      curated: [],
    });
    assert.equal(f[0]?.members.length, 2);
  });

  it("refuses a prequel released after the series (AniList really has those)", () => {
    // The live API lists ONE PIECE (1999) with `PREQUEL -> MONSTERS`, a 2024
    // ONA. Taken literally that invents a prerequisite and gives the series a
    // predecessor, which used to make it lose the anchor to a 12-episode
    // TV_SHORT airing in 2026.
    const f = buildFranchises({
      media: [
        media(1, "ONE PIECE", [
          { type: "PREQUEL", node: node(2, "MONSTERS", { format: "ONA", seasonYear: 2024, episodes: 1 }) },
          { type: "SUMMARY", node: node(3, "ONE PIECE: Gyojin Tou-hen", { format: "TV", seasonYear: 2024, episodes: 21 }) },
          { type: "SIDE_STORY", node: node(4, "CHOPPER's", { format: "TV_SHORT", seasonYear: 2026, episodes: 12 }) },
        ], { episodes: null, seasonYear: 1999 }),
        media(2, "MONSTERS", [], { format: "ONA", episodes: 1, seasonYear: 2024 }),
        media(3, "ONE PIECE: Gyojin Tou-hen", [], { format: "TV", episodes: 21, seasonYear: 2024 }),
        media(4, "CHOPPER's", [], { format: "TV_SHORT", episodes: 12, seasonYear: 2026 }),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.equal(f[0]?.name, "ONE PIECE");
    // The 2024 ONA is still part of the family, just not a "watch this first".
    assert.equal(f[0]?.members.length, 4);
    assert.deepEqual(f[0]?.missingPrerequisites, []);
    // The series leads, and the genuine SUMMARY stays ordered after it. Entries
    // nothing orders are interleaved by year, so their relative place is free.
    const order = f[0]!.members.map((m) => m.id);
    assert.equal(order[0], 1);
    assert.ok(order.indexOf(3) > order.indexOf(1));
  });

  it("anchors on the series, not the film, when no link orders the story", () => {
    // Cowboy Bebop's real shape: the films are SIDE_STORY of the TV, so nothing
    // orders the family. With no year to fall back on, the franchise must still
    // be named after the series rather than after a 1-episode film.
    const f = buildFranchises({
      media: [
        media(1, "Cowboy Bebop", [{ type: "SIDE_STORY", node: node(2, "Knockin' on Heaven's Door") }], {
          episodes: 26,
          seasonYear: 1998,
        }),
        media(2, "Knockin' on Heaven's Door", [], { format: "MOVIE", episodes: 1, seasonYear: 2001 }),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.equal(f[0]?.name, "Cowboy Bebop");
    assert.equal(f[0]?.orderSource, "estimated");
  });

  it("anchors on the origin of a chain, not its busiest middle entry", () => {
    // A real chain: every member links to its neighbour, so the middle entry
    // Tome 2 carries the most edges yet is not where the story starts.
    const f = buildFranchises({
      media: [
        media(1, "Tome 1", [{ type: "SEQUEL", node: node(2, "Tome 2") }], { seasonYear: 2001 }),
        media(2, "Tome 2", [{ type: "PREQUEL", node: node(1, "Tome 1") }, { type: "SEQUEL", node: node(3, "Tome 3") }], { seasonYear: 2003 }),
        media(3, "Tome 3", [{ type: "PREQUEL", node: node(2, "Tome 2") }], { seasonYear: 2005 }),
      ],
      statusOf: has(1, 2, 3),
      curated: [],
    });
    assert.equal(f[0]?.name, "Tome 1");
    assert.deepEqual(f[0]?.members.map((m) => m.id), [1, 2, 3]);
  });
});

describe("buildFranchises — gaps and mistakes", () => {
  it("flags a missing entry that precedes something the user owns", () => {
    // 2 lists 1 as its PREQUEL => 1 is earlier => a prerequisite the user lacks.
    const f = buildFranchises({
      media: [
        media(2, "Suite", [{ type: "PREQUEL", node: node(1, "Origine") }]),
        media(1, "Origine", []),
      ],
      statusOf: has(2),
      curated: [],
    });
    assert.deepEqual(f[0]?.missingPrerequisites.map((m) => m.id), [1]);
  });

  it("does not flag a missing entry that comes after everything owned", () => {
    const f = buildFranchises({
      media: [
        media(1, "Origine", [{ type: "SEQUEL", node: node(2, "Suite") }]),
        media(2, "Suite", []),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.deepEqual(f[0]?.missingPrerequisites, []);
  });

  it("does not flag a missing SIDE_STORY as a prerequisite", () => {
    // Cowboy Bebop -> its movie is a SIDE_STORY: watchable anytime, so owning
    // the series does not mean the user is "missing" anything.
    const f = buildFranchises({
      media: [
        media(1, "Serie", [{ type: "SIDE_STORY", node: node(5, "Le film") }]),
        media(5, "Le film", [{ type: "SIDE_STORY", node: node(1, "Serie") }]),
      ],
      statusOf: has(1),
      curated: [],
    });
    assert.equal(f[0]?.members.length, 2);
    assert.deepEqual(f[0]?.missingPrerequisites, []);
    // The missing member is still listed, just not as a prerequisite.
    assert.equal(f[0]?.members.filter((m) => m.missing).length, 1);
    assert.equal(f[0]?.members.find((m) => m.missing)?.constrainsOrder, false);
  });

  it("still flags a missing prequel, which the user does not even track", () => {
    // The prequel is discovered only as a relation node (no relations of its
    // own), which must not stop it from counting as a real prerequisite.
    const f = buildFranchises({
      media: [media(2, "Suite", [{ type: "PREQUEL", node: node(1, "Origine") }])],
      statusOf: has(2),
      curated: [],
    });
    assert.deepEqual(f[0]?.missingPrerequisites.map((m) => m.title), ["Origine"]);
    assert.equal(f[0]?.missingPrerequisites[0]?.constrainsOrder, true);
  });

  it("flags a completed entry when an earlier one is tracked but not started", () => {
    // User completed entry 2 but still has entry 1 on "Plan to Watch".
    const statuses: Record<number, MemberStatus> = {
      2: "Completed",
      1: "Plan to Watch",
    };
    const f = buildFranchises({
      media: [
        media(2, "Suite", [{ type: "PREQUEL", node: node(1, "Origine") }]),
        media(1, "Origine", []),
      ],
      statusOf: (id) => statuses[id] ?? null,
      curated: [],
    });
    assert.equal(f[0]?.outOfOrder.length, 1);
    assert.equal(f[0]?.outOfOrder[0]?.watched.id, 2);
    assert.equal(f[0]?.outOfOrder[0]?.skipped.id, 1);
  });

  it("keeps a missing prerequisite out of outOfOrder (it is its own signal)", () => {
    // User only has the sequel: that is a gap, not a viewing mistake.
    const f = buildFranchises({
      media: [
        media(2, "Suite", [{ type: "PREQUEL", node: node(1, "Origine") }]),
        media(1, "Origine", []),
      ],
      statusOf: has(2),
      curated: [],
    });
    assert.deepEqual(f[0]?.outOfOrder, []);
    assert.equal(f[0]?.missingPrerequisites.length, 1);
  });

  it("reports coverage", () => {
    const f = buildFranchises({
      media: [
        media(1, "A", [{ type: "PREQUEL", node: node(2, "B") }]),
        media(2, "B", [{ type: "PREQUEL", node: node(3, "C") }]),
        media(3, "C", []),
      ],
      statusOf: has(1, 2),
      curated: [],
    });
    assert.equal(f[0]?.owned, 2);
    assert.equal(f[0]?.members.length, 3);
  });
});

describe("applyCuratedOrder", () => {
  const byId = new Map(
    [
      media(1, "Fate/Zero", []),
      media(2, "Unlimited Blade Works", []),
      media(3, "Heaven's Feel", []),
      media(4, "Truc en Plus", []),
    ].map((m) => [m.id, m]),
  );

  it("reorders to the curated sequence", () => {
    const out = applyCuratedOrder(
      [2, 3, 1, 4],
      ["Zero", "Unlimited Blade Works", "Heaven's Feel"],
      byId,
    );
    // "Zero" must not swallow "Zero First War" incorrectly here; matched ids
    // come first in curated order, then the rest in their original order.
    assert.deepEqual(out, [1, 2, 3, 4]);
  });

  it("returns null when nothing matches, so the estimate survives", () => {
    const out = applyCuratedOrder([1, 2, 3, 4], ["Inconnu"], byId);
    assert.equal(out, null);
  });

  it("matches the longest fragment, not the first one found", () => {
    const m = new Map(
      [
        media(10, "Zero", []),
        media(11, "Zero First War", []),
      ].map((x) => [x.id, x]),
    );
    const out = applyCuratedOrder([10, 11], ["Zero First War", "Zero"], m);
    assert.deepEqual(out, [11, 10]);
  });
});

describe("buildFranchises — curated vs estimated", () => {
  // Chained so the three titles actually form one franchise; order deliberately
  // wrong in the input, which is the point of the curated table.
  const fate = [
    media(1, "Heaven's Feel", [{ type: "PREQUEL", node: node(2, "Fate/Zero") }]),
    media(2, "Fate/Zero", [{ type: "PREQUEL", node: node(3, "Unlimited Blade Works") }]),
    media(3, "Unlimited Blade Works", []),
  ];

  it("marks a franchise as verified when a curated order applied", () => {
    const f = buildFranchises({
      media: fate,
      statusOf: has(1, 2, 3),
      curated: [{ key: "Fate", fragments: ["Zero", "Unlimited Blade Works", "Heaven's Feel"] }],
    });
    assert.equal(f[0]?.orderSource, "verified");
    assert.deepEqual(f[0]?.members.map((m) => m.title), [
      "Fate/Zero",
      "Unlimited Blade Works",
      "Heaven's Feel",
    ]);
  });

  it("marks it estimated when no curated entry matches", () => {
    const f = buildFranchises({ media: fate, statusOf: has(1, 2, 3), curated: [] });
    assert.equal(f[0]?.orderSource, "estimated");
  });

  it("reports a curated-order gap even when AniList has no edge for it", () => {
    // Faithful to the live graph: Stay Night (2006) and Fate/Zero (2011) are held
    // in the same franchise only by a shared special, and no ordering edge links
    // them. The verified order supplies the sequence, so the gap it shows has to
    // be reported as a prerequisite too.
    const special = node(5, "Fate/Zero: Onegai! Einzbern Soudanshitsu", {
      format: "SPECIAL",
      seasonYear: 2012,
      episodes: 6,
    });
    const f = buildFranchises({
      media: [
        media(
          1,
          "Fate/Zero",
          [
            { type: "SEQUEL", node: node(2, "Fate/Zero 2nd Season", { seasonYear: 2012 }) },
            { type: "SIDE_STORY", node: special },
          ],
          { seasonYear: 2011 },
        ),
        media(
          3,
          "Fate/stay night",
          [
            { type: "SEQUEL", node: node(4, "Fate/stay night: Unlimited Blade Works", { seasonYear: 2014 }) },
            { type: "SIDE_STORY", node: special },
          ],
          { seasonYear: 2006 },
        ),
      ],
      statusOf: has(1),
      curated: [{ key: "Fate", fragments: ["stay night", "Zero"] }],
    });
    assert.equal(f.length, 1);
    assert.equal(f[0]?.orderSource, "verified");
    const titles = f[0]!.members.map((m) => m.title);
    // The curated order wins over the (wrong) topological sort for the first two.
    assert.deepEqual(titles.slice(0, 2), ["Fate/stay night", "Fate/Zero"]);
    assert.deepEqual(f[0]?.missingPrerequisites.map((m) => m.title), ["Fate/stay night"]);
  });
});

describe("rankFranchises", () => {
  it("surfaces franchises with gaps and mistakes first", () => {
    const withGap = buildFranchises({
      media: [media(1, "A", [{ type: "PREQUEL", node: node(2, "B") }]), media(2, "B", [])],
      statusOf: has(2),
      curated: [],
    });
    const complete = buildFranchises({
      media: [
        media(3, "C", [{ type: "PREQUEL", node: node(4, "D") }]),
        media(4, "D", []),
      ],
      statusOf: has(3, 4),
      curated: [],
    });
    const ranked = rankFranchises([...complete, ...withGap]);
    assert.equal(ranked[0]?.key, withGap[0]?.key);
  });
});

const bridge = { before: 146722, after: 190327 };
const stoneOceanP2 = {
  id: 146722,
  title: { romaji: "Stone Ocean Part 2", english: null, native: null },
  coverImage: { large: null, color: null },
  episodes: 12,
  genres: null,
  seasonYear: 2022,
  studios: null,
  averageScore: null,
  format: "ONA" as const,
};
const steelBallRun = { ...stoneOceanP2, id: 190327, title: { romaji: "Steel Ball Run 1st STAGE", english: null, native: null }, seasonYear: 2026 };

describe("curated bridges", () => {
  it("attaches the counterpart as a prequel when this member is the sequel", () => {
    const rel = bridgeRelationFor(190327, [bridge], new Map([[146722, stoneOceanP2]]));
    assert.equal(rel?.type, "PREQUEL");
    assert.equal(rel?.node.id, 146722);
    // Format and date must travel with the node or it is filtered out.
    assert.equal(rel?.node.format, "ONA");
    assert.equal(rel?.node.seasonYear, 2022);
  });

  it("attaches the counterpart as a sequel when this member is the prequel", () => {
    const rel = bridgeRelationFor(146722, [bridge], new Map([[190327, steelBallRun]]));
    assert.equal(rel?.type, "SEQUEL");
    assert.equal(rel?.node.id, 190327);
  });

  it("does nothing for an unrelated id or a missing counterpart", () => {
    assert.equal(bridgeRelationFor(1, [bridge], new Map([[146722, stoneOceanP2]])), null);
    // Metadata missing => the bridge is a no-op rather than a half-built relation.
    assert.equal(bridgeRelationFor(190327, [bridge], new Map()), null);
  });

  it("lists both endpoints so the caller knows what to fetch", () => {
    assert.deepEqual(bridgeEndpointIds([bridge]), [146722, 190327]);
    assert.deepEqual(bridgeEndpointIds(CURATED_BRIDGES).length, new Set(bridgeEndpointIds(CURATED_BRIDGES)).size);
  });

  it("walks a chain whose ids are in the wrong key order", () => {
    // Object keys that look like integers iterate in ASCENDING NUMERIC order, so
    // 131942 is visited before 146722 creates it. A single pass over the cached
    // relations therefore stopped the chain at Stone Ocean and the rest of JoJo
    // vanished from the franchise.
    const extraRelations = new Map<number, AniListRelation[]>([
      [131942, [{ type: "PREQUEL", node: node(102883, "Ougon no Kaze", { seasonYear: 2018 }) }]],
      [102883, [{ type: "PREQUEL", node: node(21450, "Diamond", { seasonYear: 2016 }) }]],
      [146722, [{ type: "PREQUEL", node: node(131942, "Stone Ocean", { seasonYear: 2021 }) }]],
    ]);
    const f = buildFranchises({
      media: [media(190327, "Steel Ball Run 1st STAGE", [], { format: "ONA", seasonYear: 2026 })],
      statusOf: has(190327),
      curated: [],
      bridges: [bridge],
      bridgeMedia: new Map([[146722, stoneOceanP2]]),
      extraRelations,
    });
    const titles = f[0]!.members.map((m) => m.title);
    // The bridge plus all three chained links must be present.
    assert.ok(titles.includes("Stone Ocean Part 2"), "bridge endpoint missing");
    assert.ok(titles.includes("Stone Ocean"), "chain broke at the numeric key order");
    assert.ok(titles.includes("Ougon no Kaze"));
    assert.ok(titles.includes("Diamond"));
  });

  it("joins a disconnected title to the rest of its franchise", () => {
    // The real JoJo shape: Steel Ball Run is attached to nothing upstream, so
    // without the bridge the franchise stops at its own two episodes.
    const owned = media(210482, "Steel Ball Run 2nd & 3rd", [
      { type: "PREQUEL", node: node(190327, "Steel Ball Run 1st STAGE", { format: "ONA", seasonYear: 2026 }) },
    ], { format: "ONA", seasonYear: 2026 });

    const without = buildFranchises({
      media: [owned],
      statusOf: has(210482),
      curated: [],
    });
    assert.equal(without[0]?.members.length, 2, "without the bridge: only its own two episodes");

    const with_ = buildFranchises({
      media: [owned],
      statusOf: has(210482),
      curated: [],
      bridges: [bridge],
      bridgeMedia: new Map([[146722, stoneOceanP2]]),
      // Diamond, which AniList links to the rest of JoJo.
      extraRelations: new Map([
        [146722, [{ type: "PREQUEL", node: node(21450, "Diamond Is Unbreakable", { seasonYear: 2016 }) }]],
      ]),
    });
    // 2 Steel Ball Run episodes + Stone Ocean Part 2 (the bridge) + Diamond (via it).
    assert.equal(with_[0]?.members.length, 4);
    const titles = with_[0]!.members.map((m) => m.title);
    assert.ok(titles.includes("Diamond Is Unbreakable"));
    // The bridge must also order: 2022 before 2026.
    assert.ok(titles.indexOf("Stone Ocean Part 2") < titles.indexOf("Steel Ball Run 2nd & 3rd"));
  });

  it("ignores a bridge whose counterpart metadata never arrived", () => {
    const owned = media(210482, "Steel Ball Run 2nd & 3rd", [
      { type: "PREQUEL", node: node(190327, "Steel Ball Run 1st STAGE", { format: "ONA", seasonYear: 2026 }) },
    ], { format: "ONA", seasonYear: 2026 });
    const f = buildFranchises({
      media: [owned],
      statusOf: has(210482),
      curated: [],
      bridges: [bridge],
      bridgeMedia: new Map(),
    });
    assert.equal(f[0]?.members.length, 2);
  });
});

describe("buildFranchises — second hop", () => {
  it("follows relations of a member that is only reachable as a relation node", () => {
    // Real AniList shape for Fate/Zero (id 10087): it links its 2nd season, a
    // short and a spin-off — and NOT Fate/stay night, which the user cares about
    // most. Fate/stay night only shows up one hop further, through the spin-off,
    // and *its* relations are what carry Unlimited Blade Works and Heaven's
    // Feel. Without the second hop the franchise stopped at 4 titles.
    const spinOff = node(154966, "Fate/strange Fake: Whispers of Dawn", {
      format: "SPECIAL",
      seasonYear: 2023,
      episodes: 1,
    });
    const f = buildFranchises({
      media: [
        media(
          1,
          "Fate/Zero",
          [
            { type: "SEQUEL", node: node(11741, "Fate/Zero 2nd Season", { episodes: 12, seasonYear: 2012 }) },
            { type: "SIDE_STORY", node: node(13263, "Fate/Zero: Onegai! Einzbern Soudanshitsu", { format: "SPECIAL", episodes: 6, seasonYear: 2012 }) },
            { type: "SPIN_OFF", node: spinOff },
          ],
          { episodes: 13, seasonYear: 2011 },
        ),
      ],
      statusOf: has(1),
      curated: [],
      extraRelations: new Map([
        [
          154966,
          [
            { type: "PREQUEL", node: node(10052, "Fate/stay night", { episodes: 12, seasonYear: 2006 }) },
          ],
        ],
        [
          10052,
          [
            { type: "SEQUEL", node: node(32281, "Fate/stay night Movie: UNLIMITED BLADE WORKS", { format: "MOVIE", seasonYear: 2010 }) },
            { type: "SEQUEL", node: node(33988, "Fate/stay night [Heaven's Feel] I. presage flower", { format: "MOVIE", seasonYear: 2012 }) },
          ],
        ],
      ]),
    });

    // The whole chain is now visible, not just the first hop.
    assert.equal(f.length, 1);
    const titles = f[0]!.members.map((m) => m.title);
    for (const expected of [
      "Fate/stay night",
      "Fate/stay night Movie: UNLIMITED BLADE WORKS",
      "Fate/stay night [Heaven's Feel] I. presage flower",
      "Fate/Zero 2nd Season",
    ]) {
      assert.ok(titles.includes(expected), `missing ${expected}`);
    }

    // Chronologically consistent: Fate/stay night (2006) then Fate/Zero (2011).
    const order = f[0]!.members.map((m) => m.title);
    assert.ok(order.indexOf("Fate/stay night") < order.indexOf("Fate/Zero"));
    // Both titles that precede the one the user owns are reported as gaps, while
    // Heaven's Feel (2012) comes after Fate/Zero (2011) and is not.
    assert.deepEqual(f[0]?.missingPrerequisites.map((m) => m.title), [
      "Fate/stay night",
      "Fate/stay night Movie: UNLIMITED BLADE WORKS",
    ]);
  });

  it("ignores extra relations for ids that are not members", () => {
    const f = buildFranchises({
      media: [
        media(1, "Alpha", [{ type: "PREQUEL", node: node(2, "Beta") }]),
        media(2, "Beta", []),
      ],
      statusOf: has(1, 2),
      curated: [],
      // 999 is unrelated to this franchise and must not smuggle itself in.
      extraRelations: new Map([[999, [{ type: "PREQUEL", node: node(1000, "Intrus") }]]]),
    });
    assert.equal(f.length, 1);
    assert.equal(f[0]?.members.length, 2);
  });

  it("never overrides relations the user already provided", () => {
    const f = buildFranchises({
      media: [
        media(1, "Alpha", [{ type: "PREQUEL", node: node(2, "Beta") }]),
        media(2, "Beta", [{ type: "SEQUEL", node: node(3, "Gamma") }]),
      ],
      statusOf: has(1, 2),
      curated: [],
      extraRelations: new Map([[2, [{ type: "PREQUEL", node: node(4, "Delta") }]]]),
    });
    assert.equal(f[0]?.members.length, 3);
  });
});

describe("splitMembersForDisplay", () => {
  /** A long franchise: the user owns one entry, the rest are untracked extras. */
  function bigFranchise() {
    const relations = [];
    for (let id = 3; id <= 14; id++) {
      relations.push({ type: "SIDE_STORY" as const, node: node(id, `Extra ${id}`) });
    }
    const f = buildFranchises({
      media: [media(1, "Series", relations, { seasonYear: 1999 }), media(2, "Sequel", [{ type: "SEQUEL", node: node(1, "Series") }], { seasonYear: 2003 })],
      statusOf: has(1),
      curated: [],
    });
    return f[0]!;
  }

  it("caps the rows but never hides what the user owns or must watch first", () => {
    const f = bigFranchise();
    assert.equal(f.members.length, 14);
    const { visible, hidden } = splitMembersForDisplay(f);
    assert.equal(visible.length + hidden.length, 14);
    // The owned entry is the actionable row, so it is never behind the toggle.
    assert.ok(visible.some((m) => m.id === 1));
    // 1 owned + 1 ordering neighbour are mandatory, then the cap pads to 8.
    assert.equal(visible.length, FRANCHISE_VISIBLE_CAP);
    assert.equal(hidden.length, 14 - FRANCHISE_VISIBLE_CAP);
  });

  it("keeps the prerequisite visible even when it sits late in the order", () => {
    // The user owns the sequel, so the series is a missing prerequisite.
    const f = buildFranchises({
      media: [
        media(2, "Suite", [{ type: "PREQUEL", node: node(1, "Origine") }], { seasonYear: 2003 }),
        media(1, "Origine", [], { seasonYear: 1999 }),
      ],
      statusOf: has(2),
      curated: [],
    });
    // Owned rows and prerequisites are mandatory, so the cap cannot push them out:
// it only ever decides which of the remaining extras to pad the list with.
    const { visible, hidden } = splitMembersForDisplay(f[0]!, 1);
    assert.deepEqual(visible.map((m) => m.title), ["Origine", "Suite"]);
    assert.deepEqual(hidden, []);
  });

  it("never hides a prerequisite, even once the cap is already full", () => {
    // The Fate case: eight members carry ordering edges, and the two titles the
    // curated order puts *before* the user's entry have no AniList edge at all, so
    // they are neither owned nor `constrainsOrder`. A cap-driven split dropped
    // exactly the two rows the card exists to surface.
    const f = buildFranchises({
      media: [
        media(
          1,
          "Fate/Zero",
          [
            { type: "SEQUEL", node: node(2, "Fate/Zero 2nd Season", { seasonYear: 2012 }) },
            { type: "SIDE_STORY", node: node(10, "Onegai", { format: "SPECIAL", seasonYear: 2012 }) },
            { type: "SIDE_STORY", node: node(11, "Extra", { format: "SPECIAL", seasonYear: 2013 }) },
          ],
          { seasonYear: 2011 },
        ),
        media(
          2,
          "Fate/Zero 2nd Season",
          [
            { type: "SEQUEL", node: node(3, "Unlimited Blade Works", { format: "MOVIE", seasonYear: 2010 }) },
            { type: "SEQUEL", node: node(4, "Heaven's Feel", { format: "MOVIE", seasonYear: 2017 }) },
            { type: "SIDE_STORY", node: node(12, "Extra 2", { format: "SPECIAL", seasonYear: 2014 }) },
            { type: "SIDE_STORY", node: node(13, "Extra 3", { format: "SPECIAL", seasonYear: 2015 }) },
            { type: "SIDE_STORY", node: node(14, "Extra 4", { format: "SPECIAL", seasonYear: 2016 }) },
          ],
          { seasonYear: 2012 },
        ),
        media(
          5,
          "Fate/stay night",
          [
            { type: "SEQUEL", node: node(6, "stay night TV", { seasonYear: 2014 }) },
            { type: "SIDE_STORY", node: node(10, "Onegai", { format: "SPECIAL", seasonYear: 2012 }) },
          ],
          { seasonYear: 2006 },
        ),
        media(6, "stay night TV", [{ type: "SIDE_STORY", node: node(15, "Extra 5", { format: "SPECIAL", seasonYear: 2018 }) }], {
          seasonYear: 2014,
        }),
      ],
      statusOf: has(1),
      curated: [{ key: "Fate", fragments: ["stay night", "stay night TV", "Unlimited Blade Works", "Zero", "Heaven's Feel"] }],
    });
    assert.equal(f[0]?.orderSource, "verified");
    // The curated order puts three missing titles before the one the user owns,
    // so all three are gaps.
    const gaps = f[0]!.missingPrerequisites.map((m) => m.title);
    assert.deepEqual(gaps, ["Fate/stay night", "stay night TV", "Unlimited Blade Works"]);

    const { visible, hidden } = splitMembersForDisplay(f[0]!);
    // The gaps lead the list and survive the split.
    for (const title of gaps) {
      assert.ok(visible.some((m) => m.title === title), `gap hidden: ${title}`);
      assert.ok(!hidden.some((m) => m.title === title), `gap hidden: ${title}`);
    }
    assert.equal(visible[0]?.title, "Fate/stay night");
    // Everything kept is still a real member, nothing duplicated.
    assert.equal(visible.length + hidden.length, f[0]!.members.length);
  });

  it("hides nothing when the franchise fits under the cap", () => {
    const f = buildFranchises({
      media: [media(1, "A", [{ type: "PREQUEL", node: node(2, "B") }]), media(2, "B", [])],
      statusOf: has(1),
      curated: [],
    });
    assert.deepEqual(splitMembersForDisplay(f[0]!).hidden, []);
  });
});
