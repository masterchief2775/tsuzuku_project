/**
 * The shared-list item vocabulary, in one place.
 *
 * It used to be spelled out four times: the client types, the server's
 * `ITEM_STATUSES` allow-list, and the label/order maps in the lists view. They
 * had already drifted ("À regarder" vs "À voir", "Terminé" vs "Vu"), and the
 * client's `SharedItemStatus | string` unions meant nothing checked them
 * against each other.
 *
 * No imports and no browser/Node APIs on purpose: both the client bundle and the
 * `/api/shared-lists` route can import this.
 */

export const SHARED_ITEM_STATUSES = ["planned", "watching", "watched", "skipped"] as const;

export type SharedItemStatus = (typeof SHARED_ITEM_STATUSES)[number];

export const SHARED_ITEM_STATUS_LABELS: Record<SharedItemStatus, string> = {
  planned: "À voir",
  watching: "En cours",
  watched: "Vu",
  skipped: "Ignoré",
};

/** Allow-list for the server: same values, as a Set. */
export const SHARED_ITEM_STATUS_SET: ReadonlySet<string> = new Set(SHARED_ITEM_STATUSES);

/**
 * Narrows an untrusted value (anything off the wire) to a real status.
 * Falls back to `planned` instead of widening the type back to `string`.
 */
export function asSharedItemStatus(v: unknown): SharedItemStatus {
  return SHARED_ITEM_STATUS_SET.has(String(v)) ? (v as SharedItemStatus) : "planned";
}