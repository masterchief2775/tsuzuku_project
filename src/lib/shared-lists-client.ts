export type SharedListRole = "owner" | "editor" | "viewer";
export type SharedItemStatus = "planned" | "watching" | "watched" | "skipped";

export type SharedListSummary = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  updatedAt: string;
  myRole: SharedListRole | string;
  itemCount: number;
  memberCount: number;
};

export type SharedListMember = {
  userId: string;
  role: SharedListRole | string;
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
  status: SharedItemStatus | string;
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
    myRole: SharedListRole | string;
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

export async function fetchMySharedLists(): Promise<SharedListSummary[]> {
  const res = await fetch("/api/shared-lists", { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { lists?: SharedListSummary[] };
  return data.lists ?? [];
}

export async function fetchSharedList(id: string): Promise<SharedListDetail | null> {
  const res = await fetch(`/api/shared-lists?id=${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as SharedListDetail;
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
