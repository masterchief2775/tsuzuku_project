import type { CuratedTable } from "./franchise.ts";

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
