import { create } from "zustand";
import {
  type StatusKey,
  type WatchlistEntry,
  type AniListMedia,
  clampProgress,
  downloadWatchlistJson,
  entryFromMedia,
  fetchMediaById,
  fetchMediaByIds,
  isNextAiringStale,
  loadEntries,
  persistEntries,
  shouldAutoComplete,
  technicalFieldsFromMedia,
  toggleValue,
} from "@/lib/watchlist";
import { fetchWatchlistState, getWatchlistVersion, saveWatchlistPatch } from "@/lib/watchlist-sync";
import { localNewerThanRemote, mergeWatchlists } from "@/lib/watchlist-merge";
import { getHabitsSnapshot, recordEpisodesWatched } from "@/lib/watch-habits";

export type ViewId = "dashboard" | "list" | "search" | "season" | "roulette" | "calendar";
export type LayoutId = "grid" | "list";
export type SortId = "updated" | "title" | "rating" | "progress" | "year" | "added";

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
} | null;

type DeletedSnapshot = { entry: WatchlistEntry; index: number };

type WatchlistState = {
  entries: WatchlistEntry[];
  hydrated: boolean;
  view: ViewId;
  layout: LayoutId;
  statusFilter: StatusKey | "Tous";
  sortBy: SortId;
  listQuery: string;
  genreFilters: string[];
  yearFilters: number[];
  studioFilters: string[];
  tagFilters: string[];
  peopleFilters: string[];
  activeEntryId: string | null;
  toast: ToastState;
  lastDeleted: DeletedSnapshot | null;
  refreshingId: string | null;
  userId: string | null;
  hydrate: (userId: string) => void;
  setView: (view: ViewId) => void;
  setLayout: (layout: LayoutId) => void;
  setStatusFilter: (filter: StatusKey | "Tous") => void;
  setSortBy: (sort: SortId) => void;
  setListQuery: (query: string) => void;
  toggleGenreFilter: (genre: string) => void;
  toggleYearFilter: (year: number) => void;
  toggleStudioFilter: (studio: string) => void;
  toggleTagFilter: (tag: string) => void;
  togglePeopleFilter: (person: string) => void;
  applyGenreAndOpenList: (genre: string) => void;
  clearAdvancedFilters: () => void;
  setActiveEntryId: (id: string | null) => void;
  showToast: (toast: Exclude<ToastState, null>) => void;
  clearToast: () => void;
  addEntry: (media: AniListMedia) => boolean;
  updateEntry: (id: string, changes: Partial<WatchlistEntry>) => void;
  bumpProgress: (id: string, delta: number) => void;
  setProgress: (id: string, progress: number) => void;
  removeEntry: (id: string) => void;
  undoRemove: () => void;
  exportJson: () => void;
  refreshFromAniList: (id: string) => Promise<void>;
  /** Non-blocking: refresh nextAiring for Watching entries whose cache is > 6h old */
  refreshNextAirings: () => Promise<void>;
  /** Merge a batch of new entries (import) — skips anilistId already present */
  applyImportedEntries: (incoming: WatchlistEntry[]) => void;
  // ---- Bulk selection (list view) ----
  selectionMode: boolean;
  selectedIds: string[];
  setSelectionMode: (on: boolean) => void;
  toggleSelected: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  bulkSetStatus: (status: StatusKey) => void;
  bulkRemove: () => void;
  bulkAddTag: (tag: string) => void;
  // ---- Offline ----
  online: boolean;
  setOnline: (online: boolean) => void;
  /** Force-push local entries to server now (awaitable). Call before sign-out. */
  flushSync: () => Promise<void>;
  /** Clear in-memory state on sign-out so next login always re-hydrates. */
  resetSession: () => void;
  // ---- Sync status (point 3: visible queue + multi-device) ----
  /** Dirty entries + deleted ids not yet uploaded. Drives the header badge. */
  pendingCount: number;
  /** Server `updated_at` of the last successful push/pull. Null until first sync. */
  lastSyncedAt: string | null;
  /**
   * Pull-if-newer: cheap version probe, full fetch + merge only when another
   * device moved the server. Call on tab-visible and online-regain.
   */
  pullRemote: () => Promise<void>;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ---- Server sync ---------------------------------------------------------
// localStorage stays the instant, offline-safe write; the server call is
// debounced and fire-and-forget so typing a comment or nudging progress
// never waits on the network. A failed push is logged and surfaced once via
// toast — it does NOT roll back the local change, since the local copy (and
// the next successful push) remains the source of truth.
//
// Incremental patches: only entries touched since the last successful push
// are uploaded (`saveWatchlistPatch`). A +1 episode sends ~2Ko instead of
// the whole list (~500Ko for 300 entries) — the single biggest Neon egress
// saver in the app.
const SYNC_DEBOUNCE_MS = 1200;
/** One-shot retry after a failed push — closes the gap when the user makes no further edits. */
const SYNC_RETRY_MS = 30_000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<unknown> | null = null;
let syncQueued = false;
let lastSyncErrorAt = 0;
/** Entries changed since the last successful push, by id. Cleared only on success. */
const pendingUpsert = new Map<string, WatchlistEntry>();
/** Ids removed since the last successful push. Cleared only on success. */
const pendingDeleted = new Set<string>();

function syncPendingCount() {
  useWatchlistStore.setState({
    pendingCount: pendingUpsert.size + pendingDeleted.size,
  });
}

function markDirty(upsert: WatchlistEntry[] = [], deleted: string[] = []) {
  for (const e of upsert) {
    pendingDeleted.delete(e.id);
    pendingUpsert.set(e.id, e);
  }
  for (const id of deleted) {
    pendingUpsert.delete(id);
    pendingDeleted.add(id);
  }
  syncPendingCount();
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(get: () => WatchlistState) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    // Still offline or nothing left to send → stay quiet; online regain and
    // tab visibility both trigger their own flush.
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (pendingUpsert.size === 0 && pendingDeleted.size === 0) return;
    void pushToServer(get);
  }, SYNC_RETRY_MS);
}

function scheduleSync(get: () => WatchlistState) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void pushToServer(get), SYNC_DEBOUNCE_MS);
}

/** Cancel pending debounce and push immediately. */
async function flushSyncNow(get: () => WatchlistState): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  // Wait out any in-flight push, then push latest once more
  if (syncInFlight) {
    try {
      await syncInFlight;
    } catch {
      /* handled inside */
    }
  }
  await pushToServer(get);
}

async function pushToServer(get: () => WatchlistState) {
  if (!get().userId) return;
  // Nothing changed since the last successful push — skip the request entirely.
  // This alone kills the no-op full uploads (e.g. hydrate + AniList refresh
  // with identical data).
  if (pendingUpsert.size === 0 && pendingDeleted.size === 0) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  // Snapshot the dirty sets: entries touched during the flight stay pending
  // for the next pass instead of being silently dropped.
  const upsert = [...pendingUpsert.values()];
  const deletedIds = [...pendingDeleted];
  const userId = get().userId;
  syncInFlight = (async () => {
    try {
      const result = await saveWatchlistPatch({ data: { upsert, deletedIds } });
      for (const e of upsert) {
        if (pendingUpsert.get(e.id) === e) pendingUpsert.delete(e.id);
      }
      for (const id of deletedIds) pendingDeleted.delete(id);
      syncPendingCount();
      clearRetry();
      if (result?.updatedAt) useWatchlistStore.setState({ lastSyncedAt: result.updatedAt });
      if (import.meta.env.DEV) {
        console.info("[watchlist] patch synced", upsert.length, "upsert +", deletedIds.length, "deleted for", userId);
      }
    } catch (err) {
      console.error("[watchlist] server sync failed", err);
      const now = Date.now();
      // Rate-limit the toast so a flapping network does not spam. Dirty sets
      // are intentionally KEPT and a 30s retry is scheduled, so the queue
      // drains even if the user makes no further edits.
      if (now - lastSyncErrorAt > 8000) {
        lastSyncErrorAt = now;
        get().showToast({
          message: "Synchronisation impossible — enregistré sur cet appareil seulement",
        });
      }
      scheduleRetry(get);
      throw err;
    }
  })()
    .catch(() => {
      /* already toasted */
    })
    .finally(() => {
      syncInFlight = null;
      if (syncQueued) {
        syncQueued = false;
        void pushToServer(get);
      }
    });
  await syncInFlight;
}

function applyPersist(
  entries: WatchlistEntry[],
  userId: string | null,
  get: () => WatchlistState,
  dirty?: { upsert?: WatchlistEntry[]; deleted?: string[] },
) {
  persistEntries(entries, userId);
  if (dirty && (dirty.upsert?.length || dirty.deleted?.length)) {
    markDirty(dirty.upsert ?? [], dirty.deleted ?? []);
  }
  scheduleSync(get);
  return entries;
}


export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  entries: [],
  hydrated: false,
  view: "dashboard",
  layout: "grid",
  statusFilter: "Tous",
  sortBy: "updated",
  listQuery: "",
  genreFilters: [],
  yearFilters: [],
  studioFilters: [],
  tagFilters: [],
  peopleFilters: [],
  activeEntryId: null,
  toast: null,
  lastDeleted: null,
  refreshingId: null,
  userId: null,
  selectionMode: false,
  selectedIds: [],
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingCount: 0,
  lastSyncedAt: null,

  hydrate: (userId) => {
    if (get().hydrated && get().userId === userId) return;
    // User switch without sign-out: drop the previous account's pending patch
    // so it can never be uploaded under the new userId.
    if (get().userId !== userId) {
      pendingUpsert.clear();
      pendingDeleted.clear();
      set({ pendingCount: 0, lastSyncedAt: null });
    }
    // Show the local copy immediately (instant, works offline) — the server
    // fetch below only ever refines this, it never blocks first paint.
    const local = loadEntries(userId);
    set({ entries: local, hydrated: true, userId });
    void (async () => {
      try {
        const snapshot = await fetchWatchlistState();
        if (get().userId !== userId) return; // user changed while this was in flight
        const remote = snapshot.entries;
        if (snapshot.updatedAt) set({ lastSyncedAt: snapshot.updatedAt });

        if (remote == null) {
          // No server row yet: seed from local if we have anything (patch with
          // all local entries doubles as an INSERT server-side).
          if (local.length > 0) {
            markDirty(local);
            await flushSyncNow(get);
          }
        } else if (remote.length === 0 && local.length > 0) {
          // Server has an empty row but this device has data — push local up
          // instead of wiping the user's list (common after a failed first sync).
          set({ entries: local });
          markDirty(local);
          await flushSyncNow(get);
        } else if (remote.length > 0) {
          // Merge wins per-entry by updatedAt (offline edits on this device
          // survive), then push back anything the server lacks or has older —
          // the old length-only check missed same-ids-newer-local edits.
          const merged = mergeWatchlists(local, remote).filter((e) => !pendingDeleted.has(e.id));
          set({ entries: merged });
          persistEntries(merged, userId);
          const stale = localNewerThanRemote(merged, remote);
          if (stale.length > 0) {
            markDirty(stale);
            await flushSyncNow(get);
          }
        } else {
          // both empty
          set({ entries: [] });
        }
      } catch (err) {
        console.error("[watchlist] initial sync failed", err);
      }
      if (get().userId === userId) void get().refreshNextAirings();
    })();
  },

  pullRemote: async () => {
    const userId = get().userId;
    if (!userId || !get().hydrated) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const { updatedAt } = await getWatchlistVersion();
      if (!updatedAt) return; // no server row yet — nothing to pull
      // ISO UTC strings compare chronologically. Equal = our own last push
      // (pushes store the returned updatedAt), so skip the ~500Ko fetch.
      const last = get().lastSyncedAt;
      if (last && updatedAt <= last) return;
      if (get().userId !== userId) return;
      const snapshot = await fetchWatchlistState();
      if (get().userId !== userId || !snapshot.entries) return;
      if (snapshot.updatedAt) set({ lastSyncedAt: snapshot.updatedAt });
      const before = get().entries;
      const merged = mergeWatchlists(before, snapshot.entries).filter(
        (e) => !pendingDeleted.has(e.id),
      );
      const changed =
        merged.length !== before.length ||
        merged.some(
          (e, i) => e.id !== before[i]?.id || e.updatedAt !== before[i]?.updatedAt,
        );
      if (!changed) return;
      set({ entries: merged });
      persistEntries(merged, userId);
      // Offline edits made here while the other device wrote still win locally
      // and must be pushed back.
      const stale = localNewerThanRemote(merged, snapshot.entries);
      if (stale.length > 0) {
        markDirty(stale);
        scheduleSync(get);
      }
    } catch {
      // Offline or transient — the 30s retry and next tab-visible cover it.
    }
  },

  setView: (view) => set({ view }),
  setLayout: (layout) => set({ layout }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setListQuery: (listQuery) => set({ listQuery }),
  toggleGenreFilter: (genre) =>
    set({ genreFilters: toggleValue(get().genreFilters, genre) }),
  toggleYearFilter: (year) =>
    set({ yearFilters: toggleValue(get().yearFilters, year) }),
  toggleStudioFilter: (studio) =>
    set({ studioFilters: toggleValue(get().studioFilters, studio) }),
  toggleTagFilter: (tag) => set({ tagFilters: toggleValue(get().tagFilters, tag) }),
  togglePeopleFilter: (person) =>
    set({ peopleFilters: toggleValue(get().peopleFilters, person) }),
  applyGenreAndOpenList: (genre) =>
    set({
      genreFilters: [genre],
      view: "list",
      statusFilter: "Tous",
      listQuery: "",
      yearFilters: [],
      studioFilters: [],
      tagFilters: [],
      peopleFilters: [],
    }),
  clearAdvancedFilters: () =>
    set({
      listQuery: "",
      genreFilters: [],
      yearFilters: [],
      studioFilters: [],
      tagFilters: [],
      peopleFilters: [],
    }),
  setActiveEntryId: (activeEntryId) => set({ activeEntryId }),

  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = null;
    }, 4200);
  },

  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    set({ toast: null });
  },

  addEntry: (media) => {
    const { entries, showToast } = get();
    if (entries.some((e) => e.anilistId === media.id)) {
      showToast({ message: "Déjà dans ta watchlist" });
      return false;
    }
    const entry = entryFromMedia(media);
    set({ entries: applyPersist([entry, ...entries], get().userId, get, { upsert: [entry] }) });
    showToast({ message: `« ${entry.title} » ajouté` });
    return true;
  },

  updateEntry: (id, changes) => {
    const { entries, showToast } = get();
    let autoCompletedTitle: string | null = null;
    let becameWatching = false;
    let completedForActivity: WatchlistEntry | null = null;
    let ratedForActivity: WatchlistEntry | null = null;
    let progressDelta = 0;
    const next = entries.map((e) => {
      if (e.id !== id) return e;
      const prevStatus = e.status;
      const prevRating = e.rating;
      const prevProgress = e.progress;
      const merged: WatchlistEntry = {
        ...e,
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      merged.progress = clampProgress(merged.progress, merged.totalEpisodes);
      if (merged.progress > prevProgress) {
        progressDelta += merged.progress - prevProgress;
      }
      if (shouldAutoComplete(merged.status, merged.progress, merged.totalEpisodes)) {
        merged.status = "Completed";
        autoCompletedTitle = merged.title;
      }
      if (merged.status === "Completed" && prevStatus !== "Completed") {
        // Terminé = tous les épisodes considérés comme vus
        if (merged.totalEpisodes != null && merged.totalEpisodes > 0) {
          merged.progress = merged.totalEpisodes;
        }
        completedForActivity = merged;
      }
      if (
        typeof merged.rating === "number" &&
        merged.rating > 0 &&
        merged.rating !== prevRating
      ) {
        ratedForActivity = merged;
      }
      if (merged.status === "Watching" && prevStatus !== "Watching") {
        becameWatching = true;
        merged.nextAiring = null; // force AniList refresh
      }
      return merged;
    });
    const changed = next.find((e) => e.id === id) ?? null;
    set({
      entries: applyPersist(next, get().userId, get, {
        upsert: changed ? [changed] : [],
      }),
    });
    if (progressDelta > 0) {
      const uid = get().userId;
      const before = getHabitsSnapshot(uid, get().entries);
      recordEpisodesWatched(uid, progressDelta);
      const after = getHabitsSnapshot(uid, get().entries);
      if (
        before.weekEpisodes < before.weeklyGoal &&
        after.weekEpisodes >= after.weeklyGoal
      ) {
        showToast({ message: `Objectif hebdo atteint (${after.weeklyGoal} ép.) 🎯` });
      } else if (after.streak > before.streak && after.streak >= 3) {
        showToast({ message: `Série : ${after.streak} jours d’affilée 🔥` });
      }
    }
    if (autoCompletedTitle) {
      showToast({ message: `« ${autoCompletedTitle} » marqué comme terminé` });
    }
    if (becameWatching) void get().refreshNextAirings();
    // Activity via plain fetch (no createServerFn) — safe for client/SSR boundary
    const act = completedForActivity || ratedForActivity;
    if (act) {
      const kind = completedForActivity ? "completed" : "rated";
      void fetch("/api/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          kind,
          title: act.title,
          anilistId: act.anilistId,
          image: act.image,
          rating: act.rating ?? null,
        }),
      }).catch(() => undefined);
    }
  },

  bumpProgress: (id, delta) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return;
    get().updateEntry(id, { progress: entry.progress + delta });
  },

  setProgress: (id, progress) => {
    get().updateEntry(id, { progress });
  },

  removeEntry: (id) => {
    const { entries, showToast } = get();
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    const entry = entries[index];
    const next = entries.filter((e) => e.id !== id);
    set({
      entries: applyPersist(next, get().userId, get, { deleted: [id] }),
      activeEntryId: null,
      lastDeleted: { entry, index },
    });
    showToast({
      message: `« ${entry.title} » retiré`,
      actionLabel: "Annuler",
      onAction: () => get().undoRemove(),
    });
  },

  undoRemove: () => {
    const { lastDeleted, entries, showToast } = get();
    if (!lastDeleted) return;
    const next = [...entries];
    const idx = Math.min(lastDeleted.index, next.length);
    next.splice(idx, 0, lastDeleted.entry);
    set({
      entries: applyPersist(next, get().userId, get, { upsert: [lastDeleted.entry] }),
      lastDeleted: null,
      activeEntryId: lastDeleted.entry.id,
    });
    showToast({ message: "Suppression annulée" });
  },

  exportJson: () => {
    downloadWatchlistJson(get().entries);
    get().showToast({ message: "Watchlist exportée" });
  },

  refreshFromAniList: async (id) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return;
    set({ refreshingId: id });
    try {
      const media = await fetchMediaById(entry.anilistId);
      get().updateEntry(id, technicalFieldsFromMedia(media));
      get().showToast({ message: "Infos AniList mises à jour" });
    } catch (err) {
      get().showToast({
        message: "Mise à jour impossible : " + (err as Error).message,
      });
    } finally {
      set({ refreshingId: null });
    }
  },

  refreshNextAirings: async () => {
    const watching = get().entries.filter(
      (e) =>
        e.status === "Watching" && (isNextAiringStale(e) || !e.bannerImage),
    );
    if (watching.length === 0) return;
    try {
      const mediaList = await fetchMediaByIds(watching.map((e) => e.anilistId));
      if (mediaList.length === 0) return;
      const byId = new Map(mediaList.map((m) => [m.id, m]));
      const now = new Date().toISOString();
      const { entries, userId } = get();
      const changed: WatchlistEntry[] = [];
      const next = entries.map((e) => {
        if (e.status !== "Watching") return e;
        const media = byId.get(e.anilistId);
        if (!media) return e;
        // airingAt: 0 + episode: 0 = "no upcoming ep", but fetchedAt stamps
        // the cache so isNextAiringStale stays false for 6h.
        const updated: WatchlistEntry = {
          ...e,
          totalEpisodes: media.episodes ?? e.totalEpisodes,
          bannerImage: media.bannerImage || e.bannerImage || null,
          image: media.coverImage?.large || e.image,
          nextAiring: media.nextAiringEpisode
            ? {
                airingAt: media.nextAiringEpisode.airingAt,
                episode: media.nextAiringEpisode.episode,
                fetchedAt: now,
              }
            : e.nextAiring?.fetchedAt && !isNextAiringStale(e)
              ? e.nextAiring
              : { airingAt: 0, episode: 0, fetchedAt: now },
        };
        // Diff the technical fields: identical refresh = no server push.
        // Without this, every hydrate re-uploaded the whole list to Neon.
        if (
          updated.totalEpisodes !== e.totalEpisodes ||
          updated.bannerImage !== e.bannerImage ||
          updated.image !== e.image ||
          JSON.stringify(updated.nextAiring) !== JSON.stringify(e.nextAiring)
        ) {
          changed.push(updated);
          return updated;
        }
        return e;
      });
      if (changed.length === 0) return;
      set({ entries: applyPersist(next, userId, get, { upsert: changed }) });
    } catch (err) {
      console.error("[watchlist] nextAiring refresh failed", err);
    }
  },

  applyImportedEntries: (incoming) => {
    if (incoming.length === 0) return;
    const { entries, userId } = get();
    const existing = new Set(entries.map((e) => e.anilistId));
    const fresh = incoming.filter((e) => !existing.has(e.anilistId));
    if (fresh.length === 0) return;
    set({ entries: applyPersist([...fresh, ...entries], userId, get, { upsert: fresh }) });
    // Refresh airing dates for newly imported Watching titles
    void get().refreshNextAirings();
  },

  setSelectionMode: (on) =>
    set({ selectionMode: on, selectedIds: on ? get().selectedIds : [] }),
  toggleSelected: (id) => {
    const cur = get().selectedIds;
    set({
      selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  },
  selectAllVisible: (ids) => set({ selectedIds: [...new Set(ids)] }),
  clearSelection: () => set({ selectedIds: [], selectionMode: false }),

  bulkSetStatus: (status) => {
    const { selectedIds, entries, userId, showToast } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const now = new Date().toISOString();
    let needsAiringRefresh = false;
    const next = entries.map((e) => {
      if (!idSet.has(e.id)) return e;
      const updated = { ...e, status, updatedAt: now };
      if (
        status === "Completed" &&
        e.status !== "Completed" &&
        updated.totalEpisodes != null &&
        updated.totalEpisodes > 0
      ) {
        updated.progress = updated.totalEpisodes;
      }
      // Passage en "En cours" : forcer un refresh AniList (banner + prochain épisode)
      if (status === "Watching" && e.status !== "Watching") {
        updated.nextAiring = null;
        needsAiringRefresh = true;
      }
      return updated;
    });
    const touched = next.filter((e) => idSet.has(e.id));
    set({
      entries: applyPersist(next, userId, get, { upsert: touched }),
      selectedIds: [],
      selectionMode: false,
    });
    showToast({
      message: `${selectedIds.length} titre${selectedIds.length > 1 ? "s" : ""} mis à jour`,
    });
    if (needsAiringRefresh || status === "Watching") {
      void get().refreshNextAirings();
    }
  },

  bulkRemove: () => {
    const { selectedIds, entries, userId, showToast } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const next = entries.filter((e) => !idSet.has(e.id));
    const n = selectedIds.length;
    set({
      entries: applyPersist(next, userId, get, { deleted: [...idSet] }),
      selectedIds: [],
      selectionMode: false,
      activeEntryId: null,
    });
    showToast({ message: `${n} titre${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}` });
  },

  bulkAddTag: (tag) => {
    const t = tag.trim();
    if (!t) return;
    const { selectedIds, entries, userId, showToast } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const now = new Date().toISOString();
    const touched: WatchlistEntry[] = [];
    const next = entries.map((e) => {
      if (!idSet.has(e.id)) return e;
      if (e.tags.includes(t)) return e;
      const updated = { ...e, tags: [...e.tags, t], updatedAt: now };
      touched.push(updated);
      return updated;
    });
    set({
      entries: applyPersist(next, userId, get, { upsert: touched }),
      selectedIds: [],
      selectionMode: false,
    });
    showToast({ message: `Tag « ${t} » ajouté` });
  },

  setOnline: (online) => {
    set({ online });
    if (online && get().userId) {
      // Push local queue first, then pull whatever moved server-side meanwhile.
      void (async () => {
        await flushSyncNow(get);
        await get().pullRemote();
      })();
    }
  },

  flushSync: async () => {
    await flushSyncNow(get);
  },

  resetSession: () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    clearRetry();
    pendingUpsert.clear();
    pendingDeleted.clear();
    set({
      entries: [],
      hydrated: false,
      userId: null,
      activeEntryId: null,
      selectedIds: [],
      selectionMode: false,
      toast: null,
      pendingCount: 0,
      lastSyncedAt: null,
    });
  },
}));
