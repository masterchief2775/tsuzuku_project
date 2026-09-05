export type ActivityItem = {
  id: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  actorAvatar: string | null;
  kind: "completed" | "rated" | "friend_request" | "friend_accept";
  title: string | null;
  anilistId: number | null;
  image: string | null;
  rating: number | null;
  createdAt: string;
  readAt: string | null;
};

export async function fetchFriendActivity(limit = 15): Promise<ActivityItem[]> {
  const res = await fetch(`/api/activity?limit=${limit}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ActivityItem[] };
  return data.items ?? [];
}

export async function markActivityRead(): Promise<void> {
  await fetch("/api/activity", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "markRead" }),
  }).catch(() => undefined);
}

export async function publishWatchActivity(input: {
  kind: "completed" | "rated";
  title: string;
  anilistId?: number | null;
  image?: string | null;
  rating?: number | null;
}): Promise<void> {
  await fetch("/api/activity", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "publish", ...input }),
  }).catch(() => undefined);
}
