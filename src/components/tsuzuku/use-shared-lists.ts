import { useCallback, useEffect, useState } from "react";
import { useVisiblePolling } from "@/lib/polling";
import { listFriends, type FriendProfile } from "@/lib/friends";
import {
  createSharedList,
  fetchMySharedLists,
  fetchSharedList,
  type SharedListDetail,
  type SharedListSummary,
} from "@/lib/shared-lists-client";

/**
 * Data layer for the shared-lists index (extracted from ListsIndex).
 * Fetch + create live here; form input, navigation and rendering stay in
 * the component.
 */
export function useSharedListsIndex(userId: string | undefined) {
  const [lists, setLists] = useState<SharedListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setLists(await fetchMySharedLists());
      setError("");
    } catch (err) {
      // Never swallow this: an empty `lists` reads as "you have no lists", so a
      // transient network failure would tell the user their lists are gone.
      setError(err instanceof Error ? err.message : "Impossible de charger tes listes.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLists([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Initial fetch runs through the shared poller below (immediate call).
  }, [userId]);

  // Was 30s in all tabs — now 60s visible, 5min hidden.
  useVisiblePolling(reload, 60_000, Boolean(userId));

  const createList = useCallback(
    async (name: string): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      setBusy(true);
      setError("");
      try {
        const res = await createSharedList(trimmed);
        await reload();
        return res?.id ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { lists, loading, busy, error, reload, createList };
}

/**
 * Data layer for one shared list (extracted from ListDetail).
 * Detail + members + mutation runner live here; pick/edit/search UI state
 * and rendering stay in the component.
 */
export function useSharedListDetail(listId: string, userId: string | undefined) {
  const [detail, setDetail] = useState<SharedListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!userId || !listId) return;
    try {
      setDetail(await fetchSharedList(listId));
      setError("");
    } catch (err) {
      setDetail(null);
      // Reported, not silently turned into "not found": a 502 must not read as
      // "deleted or forbidden".
      setError(err instanceof Error ? err.message : "Impossible de charger cette liste.");
    } finally {
      setLoading(false);
    }
  }, [userId, listId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Initial fetch runs through the shared poller below (immediate call).
  }, [userId]);

  // Was 15s in all tabs (the hottest poller in the app) — now 60s visible,
  // 5min hidden. Edits already refetch explicitly after each mutation.
  useVisiblePolling(reload, 60_000, Boolean(userId));

  useEffect(() => {
    if (!userId) return;
    void listFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [userId]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { detail, loading, friends, error, busy, reload, run };
}
