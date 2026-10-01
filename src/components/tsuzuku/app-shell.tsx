import { useEffect, useRef, useState } from "react";
import { Download, Keyboard, Link2, ShieldCheck, Upload } from "lucide-react";
import { Dashboard } from "@/components/tsuzuku/dashboard";
import { AppPrimaryNav } from "@/components/tsuzuku/app-primary-nav";
import { FriendsView } from "@/components/tsuzuku/friends-view";
import { ProfileView } from "@/components/tsuzuku/profile-view";
import { ListsView } from "@/components/tsuzuku/lists-view";
import { Link, useRouterState } from "@tanstack/react-router";
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
import { AppToast } from "@/components/tsuzuku/toast";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { MessagesView } from "@/components/tsuzuku/messages-view";
import { AdminView } from "@/components/tsuzuku/admin-view";
import { getAdminStatus } from "@/lib/admin";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heartbeatPresence } from "@/lib/presence";
import { useWatchlistStore } from "@/store/watchlist-store";
import { checkAiringReminders } from "@/lib/airing-reminders";

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
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:px-7 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <Link to="/" className="flex items-center gap-3" onClick={() => setView("dashboard")}>
            <BrandMark />
            <div className="hidden min-[400px]:block">
              <div className="font-serif text-xl font-semibold tracking-tight">Tsuzuku</div>
              <div className="text-xs text-dim">ta watchlist, en continu</div>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <NotificationsCenter />
            <ThemePicker />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-sm border border-line bg-raised p-2 text-dim hover:text-ink"
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (?)"
            >
              <Keyboard className="size-4" />
            </button>
            <UserButton />
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Partager la liste"
              title="Liste publique"
            >
              <Link2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Importer une liste MAL ou AniList"
              title="Importer MAL / AniList"
            >
              <Upload className="size-4" />
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Exporter la watchlist en JSON"
              title="Exporter JSON"
            >
              <Download className="size-4" />
            </button>
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

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-7">
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
            role="dialog"
            aria-modal="true"
            aria-label="Raccourcis clavier"
            className="w-full max-w-sm rounded-[14px] border border-line bg-raised p-5 shadow-xl"
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
