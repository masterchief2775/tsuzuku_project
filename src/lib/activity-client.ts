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
  try {
    const res = await fetch(`/api/activity?limit=${limit}`, { credentials: "include" });
    if (!res.ok) {
      console.warn("[activity] GET failed", res.status);
      return [];
    }
    const data = (await res.json()) as { items?: ActivityItem[] };
    return data.items ?? [];
  } catch (err) {
    console.warn("[activity] GET error", err);
    return [];
  }
}

export async function markActivityRead(): Promise<void> {
  try {
    await fetch("/api/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead" }),
    });
  } catch {
    /* */
  }
}

export async function publishWatchActivity(input: {
  kind: "completed" | "rated";
  title: string;
  anilistId?: number | null;
  image?: string | null;
  rating?: number | null;
}): Promise<void> {
  try {
    const res = await fetch("/api/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", ...input }),
    });
    if (!res.ok) {
      console.warn("[activity] publish failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.warn("[activity] publish error", err);
  }
}
