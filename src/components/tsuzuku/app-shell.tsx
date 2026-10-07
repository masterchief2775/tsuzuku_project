import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ListActionsMenu } from "@/components/tsuzuku/list-actions-menu";
import { Dashboard } from "@/components/tsuzuku/dashboard";
import { AppPrimaryNav } from "@/components/tsuzuku/app-primary-nav";
import { FriendsView } from "@/components/tsuzuku/friends-view";
import { ProfileView } from "@/components/tsuzuku/profile-view";
import { ListsView } from "@/components/tsuzuku/lists-view";
import { Link, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { EntryModal } from "@/components/tsuzuku/entry-modal";
import { ImportView } from "@/components/tsuzuku/import-view";
import { ListView } from "@/components/tsuzuku/list-view";
import { SearchView } from "@/components/tsuzuku/search-view";
import { SeasonView } from "@/components/tsuzuku/season-view";
import { CalendarView } from "@/components/tsuzuku/calendar-view";
import { RouletteView } from "@/components/tsuzuku/roulette-view";
import { ShareSettings } from "@/components/tsuzuku/share-settings";
import { ThemePicker } from "@/components/tsuzuku/theme-picker";
import { NotificationsCenter } from "@/components/tsuzuku/notifications-center";
import { PartyBadge } from "@/components/tsuzuku/party-badge";
import { useVisiblePolling } from "@/lib/polling";
import { AppToast } from "@/components/tsuzuku/toast";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { MessagesView } from "@/components/tsuzuku/messages-view";
import { AdminView } from "@/components/tsuzuku/admin-view";
import { getAdminStatus } from "@/lib/admin";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heartbeatPresence } from "@/lib/presence";
import { useFocusTrap } from "@/components/tsuzuku/use-focus-trap";
import { isViewId, viewTitle } from "@/lib/view-nav";
import { useWatchlistStore } from "@/store/watchlist-store";
import { checkAiringReminders } from "@/lib/airing-reminders";

// NOTE: do NOT code-split these views with React.lazy(). Doing so splits the
// SSR bundle into two chunks that import each other (one holds the server
// functions + createSsrRpc, the other holds the route tree). Because the
// generated server fns call `createSsrRpc(<hash>)` at module scope, whichever
// chunk Node evaluates second reads an uninitialized binding and every request
// dies with `TypeError: createSsrRpc is not a function` -> HTTP 500 on /, on
// /api/* and on /_serverFn/*. It only reproduces in the deployed bundle,
// depending on the module entry order Vercel picks. Keep these imports static.

export function AppShell() {
  useEffect(() => {
    void import("@/lib/p5-ui-sounds").then((m) => m.installP5UiSounds());
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { user, isPending } = useCurrentUserState();
  const view = useWatchlistStore((s) => s.view);
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const setView = useWatchlistStore((s) => s.setView);
  const exportJson = useWatchlistStore((s) => s.exportJson);
  const online = useWatchlistStore((s) => s.online);
  const pendingCount = useWatchlistStore((s) => s.pendingCount);
  const setOnline = useWatchlistStore((s) => s.setOnline);
  const searchRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const helpDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(helpDialogRef, helpOpen);

  /**
   * Publishes the sticky header's real height as `--header-h`, so other sticky
   * bars can sit exactly below it. The header is two rows tall on phones and
   * grows again when the mobile menu opens, so a hard-coded offset always
   * drifted — the selection bar used `top-[4.5rem]` (72px) under a 115px header,
   * which hid its most destructive control on mobile.
   *
   * A callback ref (not a mount effect): the `isPending` skeleton renders first,
   * so on mount there is no header to measure, and a `[]` effect would never
   * re-run once the real one appeared.
   */
  const setHeaderRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const publish = () => {
      const h = Math.round(node.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--header-h", `${h}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Lets deep views (e.g. the empty dashboard) open the import dialog without
  // lifting its state into the store: `dispatchEvent(new CustomEvent("tsuzuku:open-import"))`.
  useEffect(() => {
    const open = () => setImportOpen(true);
    const openHelp = () => setHelpOpen(true);
    const closeHelp = () => setHelpOpen(false);
    window.addEventListener("tsuzuku:open-import", open);
    window.addEventListener("tsuzuku:open-help", openHelp);
    window.addEventListener("tsuzuku:close-help", closeHelp);
    return () => {
      window.removeEventListener("tsuzuku:open-import", open);
      window.removeEventListener("tsuzuku:open-help", openHelp);
      window.removeEventListener("tsuzuku:close-help", closeHelp);
    };
  }, []);

  useEffect(() => {
    if (user?.id) hydrate(user.id);
  }, [hydrate, user?.id]);

  // N1 — views (and the open entry) in the URL: `/?v=list&entry=xyz`
  // survives refresh, drives back/forward (back closes an open fiche) and is
  // shareable. URL is read on search change; store writes push a history
  // entry. Both directions no-op when already in sync, so no loop is possible.
  const router = useRouter();
  const urlSearch = useSearch({ strict: false }) as { v?: unknown; entry?: unknown };
  const onHome = pathname === "/" || pathname === "";
  const urlView = onHome && isViewId(urlSearch.v) ? urlSearch.v : null;
  const urlEntry =
    onHome && typeof urlSearch.entry === "string" && urlSearch.entry ? urlSearch.entry : null;
  useEffect(() => {
    const st = useWatchlistStore.getState();
    if (urlView && st.view !== urlView) st.setView(urlView);
    if ((st.activeEntryId ?? null) !== urlEntry) st.setActiveEntryId(urlEntry);
  }, [urlView, urlEntry]);
  useEffect(() => {
    return useWatchlistStore.subscribe((s, prev) => {
      if (s.view === prev.view && s.activeEntryId === prev.activeEntryId) return;
      if (router.state.location.pathname !== "/") return;
      const params = new URLSearchParams(router.state.location.search);
      if (params.get("v") === s.view && (params.get("entry") ?? null) === (s.activeEntryId ?? null)) {
        return;
      }
      const next = new URLSearchParams();
      next.set("v", s.view);
      if (s.activeEntryId) next.set("entry", s.activeEntryId);
      router.history.push(`/?${next.toString()}`);
    });
  }, [router]);
  // Tab title follows the view on home (share/profile routes set their own).
  useEffect(() => {
    if (onHome) document.title = viewTitle(view);
  }, [view, onHome]);

  const refreshParties = useWatchlistStore((s) => s.refreshParties);
  // Slow background poll so the session badge appears/disappears on its own
  // (join elsewhere, host closes) — 30s visible, 5min hidden.
  useVisiblePolling(refreshParties, 30_000, Boolean(user?.id));

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    void getAdminStatus()
      .then((status) => setIsAdmin(status.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    // Skips hidden tabs: a background tab no longer writes presence to Neon
    // every 60s. Refetch fires on visibility return instead.
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void heartbeatPresence().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  // Persist pending edits when the tab is backgrounded or closed; pull remote
  // changes when it comes back (cheap version probe first — see pullRemote).
  useEffect(() => {
    const flush = () => {
      const state = useWatchlistStore.getState();
      if (state.userId && state.entries.length >= 0) {
        void state.flushSync();
      }
    };
    const onVis = () => {
      const state = useWatchlistStore.getState();
      if (document.visibilityState === "hidden") {
        if (state.userId) flush();
      } else if (state.userId && navigator.onLine) {
        void state.pullRemote();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);

  // Browser airing reminders (local notifications)
  useEffect(() => {
    const tick = () => checkAiringReminders(useWatchlistStore.getState().entries);
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const state = useWatchlistStore.getState();
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;

      if (ev.key === "Escape") {
        window.dispatchEvent(new CustomEvent("tsuzuku:close-help"));
        if (state.activeEntryId) {
          state.setActiveEntryId(null);
          ev.preventDefault();
        }
        return;
      }

      if (ev.key === "/" && !typing) {
        ev.preventDefault();
        if (state.view === "list") {
          document.getElementById("list-search-input")?.focus();
        } else {
          state.setView("search");
          requestAnimationFrame(() => searchRef.current?.focus());
        }
        return;
      }

      if (ev.key === "?" && !typing) {
        ev.preventDefault();
        window.dispatchEvent(new CustomEvent("tsuzuku:open-help"));
        return;
      }

      if (!state.activeEntryId || typing) return;

      if (ev.key === "+" || ev.key === "=") {
        ev.preventDefault();
        state.bumpProgress(state.activeEntryId, 1);
      } else if (ev.key === "-" || ev.key === "_") {
        ev.preventDefault();
        state.bumpProgress(state.activeEntryId, -1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (view === "search") {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [view]);

  if (isPending) {
    return (
      <div className="ambient-bg min-h-dvh bg-bg text-ink">
        <header className="flex items-center justify-between border-b border-line px-4 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="size-[38px] animate-pulse rounded-sm bg-raised" />
            <div className="space-y-2">
              <div className="h-5 w-24 animate-pulse rounded bg-raised" />
              <div className="h-3 w-28 animate-pulse rounded bg-raised" />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[10px] border border-line bg-raised" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  return (
    <div className="ambient-bg flex min-h-dvh flex-col bg-bg text-ink">
      {!online ? (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-[12.5px] font-semibold text-amber-200">
          Mode hors-ligne — ta liste locale reste utilisable ; les changements se synchroniseront au
          retour du réseau.
        </div>
      ) : pendingCount > 0 ? (
        <div
          className="bg-sky-500/15 px-4 py-2 text-center text-[12.5px] font-semibold text-sky-200"
          role="status"
          aria-live="polite"
        >
          {pendingCount} modification{pendingCount > 1 ? "s" : ""} en attente de synchronisation…
        </div>
      ) : null}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-[8px] focus:bg-lime focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-bg"
      >
        Aller au contenu
      </a>
      <header ref={setHeaderRef} className="sticky top-0 z-30 border-b border-line/80 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:px-7 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <Link to="/" className="flex items-center gap-3" onClick={() => setView("dashboard")}>
            <BrandMark />
            <div className="hidden min-[400px]:block">
              <div className="font-serif text-xl font-semibold tracking-tight">Tsuzuku</div>
              <div className="text-xs text-dim">ta watchlist, en continu</div>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <PartyBadge />
            <NotificationsCenter />
            <ThemePicker />
            <UserButton />
            {/* N4+U1: one overflow menu on every screen (was 4 icon buttons,
                3 of them desktop-only, hiding share/export from phones). */}
            <ListActionsMenu
              onShare={() => setShareOpen(true)}
              onImport={() => setImportOpen(true)}
              onExport={() => exportJson()}
              onHelp={() => setHelpOpen(true)}
            />
          </div>
        </div>
        <div className="mt-2.5 flex w-full min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <AppPrimaryNav />
          </div>
          {isAdmin ? (
            <Link
              to="/admin"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-lime/30 bg-lime/10 px-2.5 py-2 text-xs font-semibold text-lime transition hover:bg-lime/20"
              title="Administration"
              aria-label="Administration"
            >
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          ) : null}
        </div>
      </header>

      <main id="contenu" className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-7">
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[10px] border border-line bg-raised" />
            ))}
          </div>
        ) : pathname.startsWith("/profile") ? (
          <ProfileView />
        ) : pathname.startsWith("/friends") ? (
          <FriendsView />
        ) : pathname.startsWith("/lists") ? (
          <ListsView />
        ) : pathname.startsWith("/messages") ? (
          <MessagesView />
        ) : pathname.startsWith("/admin") ? (
          <AdminView />
        ) : view === "dashboard" ? (
          <Dashboard />
        ) : view === "search" ? (
          <SearchView inputRef={searchRef} />
        ) : view === "season" ? (
          <SeasonView />
        ) : view === "calendar" ? (
          <CalendarView />
        ) : view === "roulette" ? (
          <RouletteView />
        ) : (
          <ListView />
        )}
      </main>

      <AppFooter />

      <EntryModal />
      <ImportView open={importOpen} onClose={() => setImportOpen(false)} />
      <ShareSettings open={shareOpen} onClose={() => setShareOpen(false)} />
      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            ref={helpDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Raccourcis clavier"
            className="w-full max-w-sm rounded-[14px] border border-line bg-raised p-5 shadow-xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-base font-medium">Raccourcis clavier</h2>
            <ul className="mt-3 space-y-2 text-sm text-dim">
              {[
                ["/", "Rechercher (ou filtrer la liste)"],
                ["+", "Épisode suivant sur la fiche ouverte"],
                ["-", "Épisode précédent sur la fiche ouverte"],
                ["Échap", "Fermer la fiche / ce panneau"],
                ["?", "Ouvrir cette aide"],
              ].map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <kbd className="rounded-[6px] border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-ink">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-4 w-full rounded-[9px] border border-line bg-bg px-4 py-2 text-sm font-semibold hover:text-lime"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}
      <AppToast />
    </div>
  );
}
