import type { CuratedBridge, CuratedTable } from "./franchise.ts";

/**
 * Community watch orders for franchises where the narrative order is NOT the
 * release order and cannot be derived from `relations`.
 *
 * Two deliberate rules keep this honest:
 *
 *  - **Seed data, not a database.** Only franchises whose order is widely
 *    agreed and where a wrong guess would actually mislead. Everything else
 *    falls back to the topological sort and is labelled "estimated" in the UI.
 *  - **A reorder, never an injection.** `applyCuratedOrder` matches these
 *    fragments against nodes we already discovered, so a stale or wrong entry
 *    here cannot add a title that does not exist in this user's franchise — it
 *    can only fail to match, which leaves the estimated order untouched.
 *
 * Fragments are matched case-insensitively as substrings of the member title, and
 * the array IS the watch order. A fragment that matches several titles claims the
 * earliest released one, so overlapping fragments are written in watch order
 * ("stay night" takes the 2006 series and leaves "stay night: Unlimited Blade
 * Works" for its own entry below).
 */
export const CURATED_ORDERS: CuratedTable = [
  {
    // Fate: Zero is a prequel despite airing after Stay Night, and Heaven's Feel
    // spoils a reveal if watched before Unlimited Blade Works.
    //
    // This order is not derivable at all from `relations`: on the live API
    // Fate/stay night (2006) has no ordering edge in either direction — nothing
    // links it to Fate/Zero — so the topological sort left it stranded behind two
    // later films.
    key: "Fate",
    fragments: [
      "stay night",
      "MOVIE: UNLIMITED BLADE WORKS",
      "Zero",
      "Zero 2nd Season",
      "stay night: Unlimited Blade Works",
      "Heaven's Feel",
    ],
  },
  {
    // Gundam: the real saga order. Char's Counterattack is a film, so AniList
    // returns it as SIDE_STORY, yet it is essential to the story.
    key: "Gundam",
    fragments: [
      "Mobile Suit Gundam",
      "Zeta Gundam",
      "ZZ Gundam",
      "Char's Counterattack",
      "Mobile Suit Gundam F91",
    ],
  },
];

/**
 * One hand-checked relation AniList is missing, between two AniList ids.
 *
 * The curated fragments above only *reorder* titles we already discovered. A
 * bridge is needed when the relation genuinely does not exist upstream, so
 * walking the graph can never reach the rest of the franchise.
 *
 * The only one so far, and the bar for adding more: JoJo's chain is fully
 * modelled by AniList (Egypt-hen → Diamond → Golden Wind → Stone Ocean → Stone
 * Ocean Part 2) but **Steel Ball Run is attached to nothing** — no PREQUEL, no
 * SIDE_STORY. So owning a Steel Ball Run episode showed a two-title franchise
 * while JoJo has the whole run of parts above it.
 *
 * Deliberately ONE relation, not a hand-written JoJo list: everything else stays
 * AniList's own graph, so the order is still derived from data rather than from
 * my guess. A full hand-curated JoJo table was rejected on purpose — AniList has
 * no entries at all for Battle Tendency (part 3) or JoJolion (part 7), and
 * 14719/20474 look like two entries for the same 2012 series, so such a list
 * would be both incomplete and wrong while claiming to be "verified".
 */
export const CURATED_BRIDGES: readonly CuratedBridge[] = [
  // JoJo's Bizarre Adventure part 7 follows Stone Ocean part 2. Verified on the
  // live API: Stone Ocean Part 2 (146722, 2022) has no successor, and Steel Ball
  // Run 1st STAGE (190327, 2026) has no predecessor.
  { before: 146722, after: 190327 },
];
