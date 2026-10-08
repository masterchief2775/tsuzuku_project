import type { AniListMedia, AniListRelation, AniListRelationType } from "./watchlist.ts";

/**
 * Franchises & watch order — pure graph logic, no network.
 *
 * AniList does NOT publish a watch order. `relations` encodes *narrative*
 * links, and a film comes back as `SIDE_STORY` even when it is mandatory to
 * watch. So an order is built in two passes:
 *
 *   1. a curated table for the franchises where community order is well known
 *      and non-obvious (see `franchise-order.ts`), applied as a REORDER of
 *      nodes we actually know about — it never invents members;
 *   2. a topological sort of the narrative edges as the fallback, which is
 *      right for the large majority of franchises.
 *
 * Every result carries `orderSource` so the UI can say "verified" vs "estimated"
 * rather than presenting a guess as fact.
 */

export type FranchiseMember = {
  id: number;
  title: string;
  image: string | null;
  format: string | null;
  episodes: number | null;
  seasonYear: number | null;
  relations: AniListRelation[];
};

export type OrderSource = "verified" | "estimated";

/** Status the user has for a media, or null when it is not in their list. */
export type MemberStatus = "Watching" | "Completed" | "Plan to Watch" | "On Hold" | "Dropped" | null;

export type FranchiseMemberView = FranchiseMember & {
  status: MemberStatus;
  /** 0-based position in the computed order. */
  position: number;
  /** true when the member is not in the user's list at all. */
  missing: boolean;
  /**
   * true when at least one relation actually imposes an order for this member.
   * SIDE_STORY / SPIN_OFF / ALTERNATIVE members group into the franchise but are
   * watchable at any point, so a missing one is never a "prerequisite".
   */
  constrainsOrder: boolean;
};

export type Franchise = {
  /** Stable key derived from the root id, so React keys and cache keys agree. */
  key: string;
  name: string;
  image: string | null;
  members: FranchiseMemberView[];
  /** How many members the user actually has. */
  owned: number;
  orderSource: OrderSource;
  /**
   * Members the user is missing that come BEFORE something they have — the
   * actual "you skipped the prerequisite" signal.
   */
  missingPrerequisites: FranchiseMemberView[];
  /**
   * The user watched something out of order: they started a later entry while an
   * earlier one is still unstarted.
   */
  outOfOrder: { watched: FranchiseMemberView; skipped: FranchiseMemberView }[];
};

/**
 * Relation types that genuinely mean "same story family".
 *
 * `relations` also carries ADAPTATION (manga/novel), CHARACTER (crossovers like
 * `Evangelion x Attack ZERO`, which would otherwise merge unrelated shows into
 * one giant franchise) and OTHER. Verified against the live API, those three are
 * the reason a naive "union over every relation" is wrong here.
 */
const FAMILY_RELATIONS = new Set<string>([
  "PREQUEL",
  "SEQUEL",
  "PARENT",
  "SUMMARY",
  "SIDE_STORY",
  "ALTERNATIVE",
  "SPIN_OFF",
]);

/** Anime formats only — a MANGA/NOVEL "adaptation" is not a watchable member. */
const ANIME_FORMATS = new Set<string>([
  "TV",
  "TV_SHORT",
  "MOVIE",
  "OVA",
  "ONA",
  "SPECIAL",
  "MUSIC",
]);

/** True when this relation links two watchable titles of the same story. */
export function isFamilyRelation(rel: AniListRelation): boolean {
  if (!FAMILY_RELATIONS.has(rel.type)) return false;
  return ANIME_FORMATS.has(String(rel.node.format ?? ""));
}

/**
 * `relations[].type` describes how the NODE relates to the queried media
 * (verified on the live API: Cowboy Bebop lists its movie as `SEQUEL`, so the
 * node is later). Returns the "watch this first" side, or null when the
 * relation carries no ordering information.
 *
 * Only PREQUEL / SEQUEL / PARENT order anything. SUMMARY deliberately does not:
 * a recap is watchable on its own, and honouring it invented prerequisites —
 * the live API makes Cowboy Bebop's 1998 TV special a summary of the movie, so
 * owning the movie flagged the special as something to watch first. SIDE_STORY,
 * SPIN_OFF and ALTERNATIVE are unordered for the same reason.
 */
function earlierSide(
  mediaId: number,
  rel: AniListRelation,
): { before: number; after: number } | null {
  if (!isFamilyRelation(rel)) return null;
  switch (rel.type as AniListRelationType) {
    case "SEQUEL":
      // The node is a sequel of this media -> this media first.
      return { before: mediaId, after: rel.node.id };
    case "PREQUEL":
    case "PARENT":
      // The node is an earlier entry, or the story this one derives from.
      return { before: rel.node.id, after: mediaId };
    default:
      return null;
  }
}

/** Union-find, used to cluster connected media into franchises. */
function makeGroups(): { find: (x: number) => number; union: (a: number, b: number) => void } {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    // Walk to the representative; no path compression needed at this size.
    for (let guard = 0; guard < 10_000; guard++) {
      const next = parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    if (!parent.has(root)) parent.set(root, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  return { find, union };
}

function displayTitle(m: { title: { romaji: string | null; english: string | null; native: string | null } }) {
  return m.title.romaji || m.title.english || m.title.native || "Sans titre";
}

/**
 * One hand-checked relation AniList is missing, between two AniList ids.
 *
 * Curated fragments only *reorder* titles already discovered. A bridge is needed
 * when the relation does not exist upstream at all, so walking the graph can
 * never reach the rest of the franchise. The data lives in `franchise-order.ts`;
 * the mechanics are here so the whole rule is testable without a network call.
 */
export type CuratedBridge = {
  /** The title that comes first in the story. */
  before: number;
  /** The title that continues it. */
  after: number;
};

/** Every id a bridge touches, so the caller knows what metadata to fetch. */
export function bridgeEndpointIds(bridges: readonly CuratedBridge[]): number[] {
  return [...new Set(bridges.flatMap((b) => [b.before, b.after]))];
}

/**
 * The relation that joins `anilistId` to its bridge counterpart, or null when
 * there is no bridge (or no metadata for the other side).
 *
 * The counterpart's metadata is required: a relation node with no format is
 * filtered straight out of the franchise, so a bridge without it would silently
 * do nothing at all.
 */
export function bridgeRelationFor(
  anilistId: number,
  bridges: readonly CuratedBridge[],
  mediaById: ReadonlyMap<number, AniListMedia>,
): AniListRelation | null {
  for (const bridge of bridges) {
    const other =
      bridge.before === anilistId
        ? bridge.after
        : bridge.after === anilistId
          ? bridge.before
          : null;
    if (other == null) continue;
    const media = mediaById.get(other);
    if (!media) continue;
    return {
      // The counterpart is the earlier side, so it is a prequel of this member.
      type: other === bridge.before ? "PREQUEL" : "SEQUEL",
      node: {
        id: media.id,
        title: media.title,
        coverImage: { large: media.coverImage?.large ?? null },
        format: media.format,
        episodes: media.episodes,
        seasonYear: media.seasonYear,
      },
    };
  }
  return null;
}

/**
 * Flatten AniList nodes referenced by relations into known members.
 *
 * `extraRelations` carries the relations of members that were only discovered as
 * a relation node; it is applied in a second pass, because a node first seen as
 * someone else's relation may itself lead to more titles.
 *
 * `bridges` is applied last, and to EVERY member rather than to the user's own
 * entries: the endpoint that needs it is usually itself a synthetic member (Steel
 * Ball Run 1st STAGE is only ever seen as a relation node), so attaching it in
 * the caller would silently never fire.
 */
function withRelatedNodes(
  media: FranchiseMember[],
  extraRelations?: ReadonlyMap<number, AniListRelation[]>,
  bridges?: readonly CuratedBridge[],
  bridgeMedia?: ReadonlyMap<number, AniListMedia>,
): Map<number, FranchiseMember> {
  const known = new Map<number, FranchiseMember>();
  const addFromNode = (node: AniListRelation["node"]) => {
    if (known.has(node.id)) return;
    known.set(node.id, {
      id: node.id,
      title: displayTitle(node),
      image: node.coverImage?.large ?? null,
      format: node.format ?? null,
      episodes: node.episodes ?? null,
      seasonYear: node.seasonYear ?? null,
      relations: [],
    });
  };
  for (const m of media) known.set(m.id, m);
  // A franchise is only as good as its edges: the related nodes must exist as
  // members even when the user does not track them (they are the "missing"
  // candidates), so they get a synthetic entry derived from the relation.
  for (const m of media) {
    for (const rel of m.relations) {
      // Only family relations create a member. A manga adaptation or a
      // character crossover would otherwise show up as an unwatched "member".
      if (!isFamilyRelation(rel)) continue;
      addFromNode(rel.node);
    }
  }
  // Hand-checked links AniList is missing. Runs BEFORE `extraRelations` so a
  // member the bridge creates can itself receive fetched relations, and once
  // more after, in case an endpoint only showed up in that pass.
  const bridged = new Set<number>();
  const applyBridges = () => {
    if (!bridges?.length || !bridgeMedia) return;
    for (const m of [...known.values()]) {
      if (bridged.has(m.id)) continue;
      const rel = bridgeRelationFor(m.id, bridges, bridgeMedia);
      if (!rel) continue;
      bridged.add(m.id);
      m.relations = [...m.relations, rel];
      if (isFamilyRelation(rel)) addFromNode(rel.node);
    }
  };
  applyBridges();
  // Attach fetched relations until nothing new appears.
  //
  // One pass is NOT enough, and the reason is subtle: object keys that look like
  // integers come back in ascending numeric order, not insertion order. So the
  // cached id 131942 (Stone Ocean) is visited *before* 146722 (Stone Ocean Part
  // 2) creates it, and a single pass silently dropped the rest of JoJo. Repeating
  // until no member is added walks the chain properly; each id is filled once, so
  // it terminates.
  if (extraRelations) {
    for (let pass = 0; pass < 64; pass++) {
      let added = 0;
      for (const [id, relations] of extraRelations) {
        const member = known.get(id);
        if (!member || member.relations.length > 0) continue;
        member.relations = relations;
        for (const rel of relations) {
          if (!isFamilyRelation(rel)) continue;
          const before = known.size;
          addFromNode(rel.node);
          if (known.size > before) added++;
        }
      }
      if (added === 0) break;
    }
  }
  applyBridges();
  return known;
}

/**
 * AniList's relations are hand-maintained and do contain entries that cannot be
 * true. The live API lists ONE PIECE (1999) with `PREQUEL -> "MONSTERS:
 * Ippaku Sanjou Hiryuu Jigoku"` (a 2024 ONA) — a prequel released 25 years after
 * the series it precedes. Kept, that single edge invents a "watch this first"
 * prerequisite, and worse, it gives the real series a predecessor, which
 * disqualifies it from anchoring its own franchise.
 *
 * So an ordering edge whose calendar contradicts the relation is dropped: when
 * both years are known and the "earlier" side is actually the later one, we
 * simply do not order them. The two titles stay in the same franchise — only
 * the ordering claim is refused.
 */
function contradictsCalendar(before: number, after: number, byId: Map<number, FranchiseMember>): boolean {
  const yb = byId.get(before)?.seasonYear;
  const ya = byId.get(after)?.seasonYear;
  if (yb == null || ya == null) return false;
  return yb > ya;
}

/**
 * Name anchor for a franchise: which member is "the" franchise.
 *
 * Not "the first to watch": AniList omits `seasonYear` on plenty of entries, and
 * a franchise where every link is a SIDE_STORY (Cowboy Bebop and its films) has
 * no ordering at all, so that tie-break happily names the franchise after the
 * film.
 *
 * Preference order, strongest signal first:
 *
 *   1. the fewest ordering edges pointing *at* it, so a sequel never outranks its
 *      own origin. Once the graph is walked two hops deep, Fate/Zero 2nd Season
 *      carries more outgoing edges than Fate/Zero (it points at two Heaven's Feel
 *      entries AniList mislabels) and used to win the anchor on edge count alone;
 *   2. the most ordering edges leading out of it — the spine of the story. The
 *      main series is the hub everything else hangs off (ONE PIECE points at 9 of
 *      its own recaps), which no film or special ever does;
 *   3. a series rather than a film (TV > long/short TV > movie > OVA/ONA >
 *      special), which decides every unordered franchise such as Cowboy Bebop;
 *   4. earliest release year, then most episodes, then lowest id, so the choice
 *      is deterministic.
 */
function pickAnchor(
  order: number[],
  byId: Map<number, FranchiseMember>,
  edgesOut: Map<number, number>,
  edgesIn: Map<number, number>,
): number {
  const best = [...order];
  best.sort((a, b) => {
    const ia = edgesIn.get(a) ?? 0;
    const ib = edgesIn.get(b) ?? 0;
    if (ia !== ib) return ia - ib;
    const oa = edgesOut.get(a) ?? 0;
    const ob = edgesOut.get(b) ?? 0;
    if (ob !== oa) return ob - oa;
    const fa = SERIES_RANK[String(byId.get(a)!.format ?? "")] ?? 9;
    const fb = SERIES_RANK[String(byId.get(b)!.format ?? "")] ?? 9;
    if (fa !== fb) return fa - fb;
    const ya = byId.get(a)!.seasonYear ?? Number.MAX_SAFE_INTEGER;
    const yb = byId.get(b)!.seasonYear ?? Number.MAX_SAFE_INTEGER;
    if (ya !== yb) return ya - yb;
    const pa = byId.get(a)!.episodes ?? -1;
    const pb = byId.get(b)!.episodes ?? -1;
    if (pb !== pa) return pb - pa;
    return a - b;
  });
  return best[0] ?? order[0]!;
}

/** Series-first, so an unordered franchise is never named after one of its films. */
const SERIES_RANK: Record<string, number> = {
  TV: 0,
  TV_SHORT: 1,
  LONG: 1,
  MOVIE: 2,
  OVA: 3,
  ONA: 3,
  SPECIAL: 4,
};

/** Kahn's algorithm; leftovers (cycles, which AniList does contain) keep year order. */
function topoOrder(group: FranchiseMember[], byId: Map<number, FranchiseMember>): number[] {
  const indegree = new Map<number, number>();
  const out = new Map<number, number[]>();
  const inGroup = new Set(group.map((m) => m.id));
  for (const m of group) {
    indegree.set(m.id, 0);
    out.set(m.id, []);
  }
  for (const m of group) {
    for (const rel of m.relations) {
      const edge = earlierSide(m.id, rel);
      if (!edge || !inGroup.has(edge.before) || !inGroup.has(edge.after)) continue;
      // Same calendar guard as the anchor, or the sort would honour a relation
      // the anchor deliberately refused.
      if (contradictsCalendar(edge.before, edge.after, byId)) continue;
      out.get(edge.before)!.push(edge.after);
      indegree.set(edge.after, (indegree.get(edge.after) ?? 0) + 1);
    }
  }
  const byYear = (a: number, b: number) => {
    const ma = byId.get(a)!;
    const mb = byId.get(b)!;
    const ya = ma.seasonYear ?? Number.MAX_SAFE_INTEGER;
    const yb = mb.seasonYear ?? Number.MAX_SAFE_INTEGER;
    if (ya !== yb) return ya - yb;
    return a - b;
  };
  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort(byYear);
  const order: number[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort(byYear);
      }
    }
  }
  // Cycles: append whatever is left, still in a sane order.
  if (order.length < group.length) {
    const seen = new Set(order);
    for (const m of [...group].sort((a, b) => byYear(a.id, b.id))) {
      if (!seen.has(m.id)) order.push(m.id);
    }
  }
  return order;
}

/**
 * Applies a curated fragment list as a reorder. The array IS the watch order.
 *
 * A fragment often matches several titles ("stay night" hits the 2006 series, the
 * 2010 film and the 2014 TV series), so each fragment claims exactly one of them:
 * the **earliest released**, then the shortest title, then the lowest id. That
 * makes an overlapping list writable in watch order — "stay night" takes the
 * original and leaves "stay night: Unlimited Blade Works" for its own fragment —
 * instead of forcing the table to be sorted most-specific-first, which is the
 * opposite of what a watch order wants.
 *
 * Unknown fragments are ignored, and titles no fragment claimed keep their
 * computed relative order at the end.
 */
export function applyCuratedOrder(ids: number[], fragments: string[], byId: Map<number, FranchiseMember>): number[] | null {
  const remaining = new Set(ids);
  const ordered: number[] = [];
  for (const fragment of fragments) {
    const f = fragment.toLowerCase();
    let best: number | null = null;
    let bestLen = -1;
    for (const id of remaining) {
      const member = byId.get(id)!;
      if (!member.title.toLowerCase().includes(f)) continue;
      if (f.length <= bestLen) continue;
      const year = member.seasonYear ?? Number.MAX_SAFE_INTEGER;
      const bestYear = best == null ? Number.MAX_SAFE_INTEGER : byId.get(best)!.seasonYear ?? Number.MAX_SAFE_INTEGER;
      const bestTitle = best == null ? "" : byId.get(best)!.title;
      // Prefer the longest fragment, then the earliest release, then the shortest
      // title, then the lowest id: fully deterministic.
      if (
        f.length > bestLen ||
        (year < bestYear && f.length === bestLen) ||
        (f.length === bestLen && year === bestYear && member.title.length < bestTitle.length) ||
        (f.length === bestLen &&
          year === bestYear &&
          member.title.length === bestTitle.length &&
          (best == null || id < best))
      ) {
        best = id;
        bestLen = f.length;
      }
    }
    if (best != null) {
      ordered.push(best);
      remaining.delete(best);
    }
  }
  if (ordered.length === 0) return null;
  for (const id of ids) if (remaining.has(id)) ordered.push(id);
  return ordered;
}

/** Curated orders keyed by a fragment of the franchise root title. */
export type CuratedEntry = { key: string; fragments: string[] };
export type CuratedTable = readonly CuratedEntry[];

export function buildFranchises(input: {
  media: FranchiseMember[];
  statusOf: (anilistId: number) => MemberStatus;
  /** Only franchises with at least this many members are kept. */
  minSize?: number;
  curated?: CuratedTable;
  /**
   * Relations already fetched for members the user does NOT track.
   *
   * Without this, a member discovered only as a relation node has no relations of
   * its own, so the graph stops at one hop: owning Fate/Zero surfaced 4 titles
   * and never mentioned Fate/stay night, which is the entry that carries the rest
   * of the chain. Supplying the second hop here pulls in 10.
   */
  extraRelations?: ReadonlyMap<number, AniListRelation[]>;
  /** Hand-checked relations AniList is missing; data in `franchise-order.ts`. */
  bridges?: readonly CuratedBridge[];
  /** Metadata for the bridge endpoints, keyed by AniList id. */
  bridgeMedia?: ReadonlyMap<number, AniListMedia>;
}): Franchise[] {
  const byId = withRelatedNodes(input.media, input.extraRelations, input.bridges, input.bridgeMedia);
  const all = [...byId.values()];
  const { find, union } = makeGroups();

  for (const m of all) {
    for (const rel of m.relations) {
      // Family relations only: CHARACTER crossovers would merge unrelated
      // franchises, ADAPTATION would pull in the manga.
      if (isFamilyRelation(rel) && byId.has(rel.node.id)) union(m.id, rel.node.id);
    }
  }

  const groups = new Map<number, FranchiseMember[]>();
  for (const m of all) {
    const g = find(m.id);
    const list = groups.get(g);
    if (list) list.push(m);
    else groups.set(g, [m]);
  }

  const minSize = input.minSize ?? 2;
  const franchises: Franchise[] = [];

  for (const group of groups.values()) {
    if (group.length < minSize) continue;

    // Ordering edges across the WHOLE known set, not just the user's entries: a
    // member discovered only as a relation node has no relations of its own, so
    // its own `relations` array cannot tell us it constrains the order.
    const edgesOut = new Map<number, number>();
    const edgesIn = new Map<number, number>();
    const orderImposed = new Set<number>();
    for (const m of all) {
      for (const rel of m.relations) {
        const edge = earlierSide(m.id, rel);
        if (!edge) continue;
        if (contradictsCalendar(edge.before, edge.after, byId)) continue;
        orderImposed.add(edge.before);
        orderImposed.add(edge.after);
        edgesOut.set(edge.before, (edgesOut.get(edge.before) ?? 0) + 1);
        edgesIn.set(edge.after, (edgesIn.get(edge.after) ?? 0) + 1);
      }
    }

    let order = topoOrder(group, byId);
    const anchorId = pickAnchor(order, byId, edgesOut, edgesIn);
    const root = byId.get(anchorId) ?? group[0]!;

    let orderSource: OrderSource = "estimated";
    for (const entry of input.curated ?? []) {
      // Matched against every member, not just the anchor: relations are sparse
      // and the anchor title is not always the recognisable one (a Gundam
      // franchise may anchor on a film). A curated entry that matches nothing
      // leaves the estimate untouched.
      const key = entry.key.toLowerCase();
      const matches = order.some((id) => byId.get(id)!.title.toLowerCase().includes(key));
      if (!matches) continue;
      const applied = applyCuratedOrder(order, entry.fragments, byId);
      if (applied) {
        order = applied;
        orderSource = "verified";
      }
      break;
    }

    const members: FranchiseMemberView[] = order.map((id, position) => {
      const m = byId.get(id)!;
      const status = input.statusOf(id);
      return {
        ...m,
        status,
        position,
        missing: status == null,
        constrainsOrder: orderImposed.has(id),
      };
    });

    const missingPrerequisites: FranchiseMemberView[] = [];
    for (const member of members) {
      if (!member.missing) continue;
      // Only a member that genuinely orders the story can be a prerequisite: a
      // missing spin-off or movie you can watch anytime is not a gap. When the
      // order came from the curated table the whole shown sequence IS the
      // narrative order — Fate/stay night has no AniList edge at all yet the
      // verified order puts it before Fate/Zero, so it is a real prerequisite and
      // has to be reported as one.
      if (!member.constrainsOrder && orderSource !== "verified") continue;
      const ownedLater = members.some((o) => !o.missing && o.position > member.position);
      if (ownedLater) missingPrerequisites.push(member);
    }

    const outOfOrder: Franchise["outOfOrder"] = [];
    for (const watched of members) {
      if (watched.missing) continue;
      if (watched.status !== "Completed" && watched.status !== "Watching") continue;
      for (const earlier of members) {
        if (earlier.position >= watched.position) break;
        // Only members the user actually tracks but has NOT started. An entry
        // missing from their list entirely is `missingPrerequisites`, which is
        // a different (and separately actionable) signal.
        if (earlier.missing) continue;
        if (earlier.status !== "Plan to Watch") continue;
        outOfOrder.push({ watched, skipped: earlier });
      }
    }

    franchises.push({
      key: `fr-${root.id}`,
      name: root.title,
      image: root.image,
      members,
      owned: members.filter((m) => !m.missing).length,
      orderSource,
      missingPrerequisites,
      outOfOrder,
    });
  }

  // Biggest and most complete first: the ones worth acting on.
  franchises.sort((a, b) => b.members.length - a.members.length || b.owned - a.owned);
  return franchises;
}

/** Franchises worth surfacing first: gaps and mistakes, then coverage. */
export function rankFranchises(f: Franchise[]): Franchise[] {
  return [...f].sort((a, b) => {
    const score = (x: Franchise) =>
      x.missingPrerequisites.length * 3 + x.outOfOrder.length * 2 + (x.members.length - x.owned);
    return score(b) - score(a) || b.owned - a.owned;
  });
}

/**
 * Rows shown before the "and N more" disclosure. ONE PIECE links 65 relations,
 * so without a cap a single entry dumps 49 rows of untracked films.
 */
export const FRANCHISE_VISIBLE_CAP = 8;

/**
 * Splits a franchise into the rows worth showing and the ones behind the
 * disclosure. Always visible: what the user owns, what orders the story, and what
 * was reported as a prerequisite. Those are the actionable rows, and the cap must
 * never push one out.
 *
 * The prerequisite clause is not redundant with `constrainsOrder`. Fate/stay night
 * comes before Fate/Zero in the curated order while having no AniList edge at
 * all, so it is neither owned nor `constrainsOrder` — and a franchise with eight
 * ordering members would otherwise hide the two titles it is telling the user to
 * go and watch.
 */
export function splitMembersForDisplay(
  franchise: Franchise,
  cap = FRANCHISE_VISIBLE_CAP,
): { visible: FranchiseMemberView[]; hidden: FranchiseMemberView[] } {
  const mustShow = new Set<number>(franchise.missingPrerequisites.map((m) => m.id));
  for (const m of franchise.outOfOrder) mustShow.add(m.skipped.id);
  const keep = new Set<number>();
  for (const m of franchise.members) {
    if (!m.missing || m.constrainsOrder || mustShow.has(m.id)) keep.add(m.id);
  }
  // Pad with the rest in order, never at the expense of a row above.
  for (const m of franchise.members) {
    if (keep.size >= cap) break;
    keep.add(m.id);
  }
  return {
    visible: franchise.members.filter((m) => keep.has(m.id)),
    hidden: franchise.members.filter((m) => !keep.has(m.id)),
  };
}
