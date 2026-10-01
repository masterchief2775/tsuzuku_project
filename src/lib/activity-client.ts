import { useCallback, useEffect, useState } from "react";
import { useVisiblePolling } from "@/lib/polling";

export type ActivityItem = {
  id: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  actorAvatar: string | null;
  kind: "completed" | "rated" | "friend_request" | "friend_accept" | "list_add" | "list_join" | "list_vote";
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


export type BadgeCounts = {
  unreadActivity: number;
  pendingFriendRequests: number;
  unreadMessages: number;
};

export async function fetchActivityBadge(): Promise<BadgeCounts> {
  try {
    const res = await fetch("/api/activity?counts=1", { credentials: "include" });
    if (!res.ok) return { unreadActivity: 0, pendingFriendRequests: 0, unreadMessages: 0 };
    const data = (await res.json()) as {
      unreadActivity?: number;
      pendingFriendRequests?: number;
      unreadMessages?: number;
    };
    return {
      unreadActivity: Number(data.unreadActivity || 0),
      pendingFriendRequests: Number(data.pendingFriendRequests || 0),
      unreadMessages: Number(data.unreadMessages || 0),
    };
  } catch {
    return { unreadActivity: 0, pendingFriendRequests: 0, unreadMessages: 0 };
  }
}

/**
 * Shared badge cache: the header (`NotificationsCenter`), the nav
 * (`AppPrimaryNav`) and the message hook all need the same counts. Without
 * this, each mount fired its own poller (was: 2× message-count every 15s +
 * badge every 30s). Concurrent callers share one in-flight request, and
 * results are reused for 20s so staggered mount effects don't double-fetch.
 */
let cachedBadge: BadgeCounts | null = null;
let cachedBadgeAt = 0;
let badgeInFlight: Promise<BadgeCounts> | null = null;
const BADGE_TTL_MS = 20_000;

export function getBadgeCounts(): Promise<BadgeCounts> {
  const now = Date.now();
  if (cachedBadge && now - cachedBadgeAt < BADGE_TTL_MS) {
    return Promise.resolve(cachedBadge);
  }
  badgeInFlight ??= fetchActivityBadge()
    .then((b) => {
      cachedBadge = b;
      cachedBadgeAt = Date.now();
      return b;
    })
    .finally(() => {
      badgeInFlight = null;
    });
  return badgeInFlight;
}

/** Force a refresh after a local action (mark-read, thread opened, …). */
export function invalidateBadgeCache() {
  cachedBadge = null;
  cachedBadgeAt = 0;
}

/**
 * Single shared 60s-visible poller for ALL header badges. Every consumer
 * (notifications bell, nav message dot) calling this hook shares the cached
 * fetch — mounting it twice costs zero extra Neon queries.
 */
export function useBadgeCounts(userId: string | undefined) {
  const [badge, setBadge] = useState<BadgeCounts>({
    unreadActivity: 0,
    pendingFriendRequests: 0,
    unreadMessages: 0,
  });
  const reload = useCallback(() => {
    if (!userId) return;
    void getBadgeCounts()
      .then(setBadge)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBadge({ unreadActivity: 0, pendingFriendRequests: 0, unreadMessages: 0 });
    }
  }, [userId]);

  useVisiblePolling(reload, 60_000, Boolean(userId));
  return { ...badge, reload };
}
