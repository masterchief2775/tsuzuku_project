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
 * Fragments are matched case-insensitively as substrings of the member title.
 */
export const CURATED_ORDERS: CuratedTable = [
  {
    // Fate: watching Heaven's Feel before Unlimited Blade Works spoils a major
    // reveal, and Zero is a prequel despite airing later than Stay Night.
    key: "Fate",
    fragments: ["Zero", "Zero First War", "Unlimited Blade Works", "Heaven's Feel"],
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
