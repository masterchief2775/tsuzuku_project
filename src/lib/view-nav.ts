import type { ViewId } from "@/store/watchlist-store";

/**
 * View ↔ URL binding (N1): the six home views live in `?v=` so refresh,
 * back/forward and shared links keep their place. Unknown/absent `v`
 * falls back to the store default (dashboard) without touching history.
 */
export const VIEW_IDS = [
  "dashboard",
  "list",
  "search",
  "season",
  "roulette",
  "calendar",
  "timeline",
  "franchises",
] as const satisfies readonly ViewId[];

export function isViewId(value: unknown): value is ViewId {
  return typeof value === "string" && (VIEW_IDS as readonly string[]).includes(value);
}

export function viewSearch(view: ViewId): string {
  return `/?v=${view}`;
}

const VIEW_TITLES: Record<ViewId, string> = {
  dashboard: "Accueil · Tsuzuku",
  list: "Ma liste · Tsuzuku",
  search: "Rechercher · Tsuzuku",
  season: "Saison · Tsuzuku",
  roulette: "Roulette · Tsuzuku",
  calendar: "Calendrier · Tsuzuku",
  timeline: "Chronologie · Tsuzuku",
  franchises: "Franchises · Tsuzuku",
};

export function viewTitle(view: ViewId): string {
  return VIEW_TITLES[view];
}
