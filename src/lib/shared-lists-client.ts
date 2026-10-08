/** Single source of truth for the shared-list vocabulary: see
 *  `./shared-list-status`, which the `/api/shared-lists` route imports too.
 *  Re-exported here because most callers already reach for this module.
 *
 *  These unions used to be written `SharedItemStatus | string` /
 *  `SharedListRole | string`, which collapses to `string` and silently disabled
 *  every check on those fields (a typo in a status comparison, or a `role` used
 *  where a status belongs, both compiled fine). Server values are now
 *  trusted-but-checked: `asItemStatus` / `asRole` narrow whatever comes back
 *  over the wire, so drift surfaces here instead of downstream. */
import {
  asSharedItemStatus,
  type SharedItemStatus,
} from "@/lib/shared-list-status";

export {
  SHARED_ITEM_STATUSES,
  SHARED_ITEM_STATUS_LABELS,
  type SharedItemStatus,
} from "@/lib/shared-list-status";

export const SHARED_LIST_ROLES = ["owner", "editor", "viewer"] as const;
export type SharedListRole = (typeof SHARED_LIST_ROLES)[number];

export function asRole(v: unknown): SharedListRole {
  return SHARED_LIST_ROLES.includes(v as SharedListRole) ? (v as SharedListRole) : "viewer";
}

export type SharedListSummary = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  updatedAt: string;
  myRole: SharedListRole;
  itemCount: number;
  memberCount: number;
};

export type SharedListMember = {
  userId: string;
  role: SharedListRole;
  joinedAt: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type SharedListItem = {
  id: string;
  anilistId: number;
  title: string;
  image: string | null;
  addedBy: string;
  addedByName: string;
  createdAt: string;
  status: SharedItemStatus;
  notes: string | null;
  priority: number;
  voteCount: number;
  votedByMe: boolean;
};

export type SharedListDetail = {
  list: {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
    myRole: SharedListRole;
    inviteEnabled?: boolean;
    inviteToken?: string | null;
  };
  members: SharedListMember[];
  items: SharedListItem[];
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/shared-lists", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data;
}

/** Shape as it arrives from the API: the union fields are plain strings until
 *  `asItemStatus` / `asRole` narrow them. */
type SharedListSummaryWire = Omit<SharedListSummary, "myRole"> & { myRole: string };
type SharedListMemberWire = Omit<SharedListMember, "role"> & { role: string };
type SharedListItemWire = Omit<SharedListItem, "status"> & { status: string };
type SharedListDetailWire = Omit<SharedListDetail, "list" | "members" | "items"> & {
  list: Omit<SharedListDetail["list"], "myRole"> & { myRole: string };
  members?: SharedListMemberWire[];
  items?: SharedListItemWire[];
};

export async function fetchMySharedLists(): Promise<SharedListSummary[]> {
  const res = await fetch("/api/shared-lists", { credentials: "include" });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const data = (await res.json()) as { lists?: SharedListSummaryWire[] };
  return (data.lists ?? []).map((l) => ({ ...l, myRole: asRole(l.myRole) }));
}

export async function fetchSharedList(id: string): Promise<SharedListDetail | null> {
  const res = await fetch(`/api/shared-lists?id=${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return null;
    throw new Error(`Erreur ${res.status}`);
  }
  const data = (await res.json()) as SharedListDetailWire;
  return {
    ...data,
    list: { ...data.list, myRole: asRole(data.list.myRole) },
    members: (data.members ?? []).map((m) => ({ ...m, role: asRole(m.role) })),
    items: (data.items ?? []).map((i) => ({ ...i, status: asSharedItemStatus(i.status) })),
  };
}

export async function createSharedList(name: string, description?: string) {
  return post({ action: "create", name, description: description || "" }) as Promise<{ ok: true; id: string }>;
}

export async function renameSharedList(listId: string, name: string, description?: string) {
  return post({ action: "rename", listId, name, description: description || "" });
}

export async function deleteSharedList(listId: string) {
  return post({ action: "delete", listId });
}

export async function addSharedListMember(listId: string, userId: string, role?: SharedListRole) {
  return post({ action: "addMember", listId, userId, role: role || "editor" });
}

export async function removeSharedListMember(listId: string, userId: string) {
  return post({ action: "removeMember", listId, userId });
}

export async function addSharedListItem(
  listId: string,
  input: { anilistId: number; title: string; image?: string | null },
) {
  return post({ action: "addItem", listId, ...input });
}

export async function addSharedListItemsBulk(
  listId: string,
  items: { anilistId: number; title: string; image?: string | null }[],
) {
  return post({ action: "addItemsBulk", listId, items });
}

export async function removeSharedListItem(listId: string, itemId: string) {
  return post({ action: "removeItem", listId, itemId });
}

export async function setSharedListItemStatus(listId: string, itemId: string, status: SharedItemStatus) {
  return post({ action: "setItemStatus", listId, itemId, status });
}

export async function toggleSharedListVote(listId: string, itemId: string) {
  return post({ action: "toggleVote", listId, itemId });
}

export async function enableSharedListInvite(listId: string) {
  return post({ action: "enableInvite", listId }) as Promise<{ ok: true; token: string }>;
}

export async function disableSharedListInvite(listId: string) {
  return post({ action: "disableInvite", listId });
}

export async function joinSharedListByToken(token: string) {
  return post({ action: "joinByInvite", token }) as Promise<{ ok: true; listId: string }>;
}
