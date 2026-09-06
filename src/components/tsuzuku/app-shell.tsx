import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clapperboard, Dices, Download, Home, Link2, List, Search, Upload, User } from "lucide-react";
import { Dashboard } from "@/components/tsuzuku/dashboard";
import { AppPrimaryNav } from "@/components/tsuzuku/app-primary-nav";
import { EntryModal } from "@/components/tsuzuku/entry-modal";
import { ImportView } from "@/components/tsuzuku/import-view";
import { ListView } from "@/components/tsuzuku/list-view";
import { SearchView } from "@/components/tsuzuku/search-view";
import { SeasonView } from "@/components/tsuzuku/season-view";
import { RouletteView } from "@/components/tsuzuku/roulette-view";
import { ShareSettings } from "@/components/tsuzuku/share-settings";
import { ThemePicker } from "@/components/tsuzuku/theme-picker";
import { AppToast } from "@/components/tsuzuku/toast";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { fetchActivityBadge } from "@/lib/activity-client";
import { cn } from "@/lib/utils";
import { useWatchlistStore, type ViewId } from "@/store/watchlist-store";

export function AppShell() {
  const { user: authUser } = useCurrentUserState();
  const [badgeCount, setBadgeCount] = useState(0);
  useEffect(() => {
    if (!authUser?.id) {
      setBadgeCount(0);
      return;
    }
    let cancelled = false;
    const tick = () => {
      void fetchActivityBadge().then((b) => {
        if (!cancelled) setBadgeCount(b.unreadActivity + b.pendingFriendRequests);
      });
    };
    tick();
    const id = window.setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authUser?.id]);

  const { user, isPending } = useCurrentUserState();
  const view = useWatchlistStore((s) => s.view);
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const setView = useWatchlistStore((s) => s.setView);
  const exportJson = useWatchlistStore((s) => s.exportJson);
  const online = useWatchlistStore((s) => s.online);
  const setOnline = useWatchlistStore((s) => s.setOnline);
  const searchRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (user?.id) hydrate(user.id);
  }, [hydrate, user?.id]);

  // Persist pending edits when the tab is backgrounded or closed.
  useEffect(() => {
    const flush = () => {
      const state = useWatchlistStore.getState();
      if (state.userId && state.entries.length >= 0) {
        void state.flushSync();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
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

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const state = useWatchlistStore.getState();
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;

      if (ev.key === "Escape") {
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
      <div className="min-h-dvh bg-bg text-ink">
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
    <div className="min-h-dvh bg-bg text-ink">
      {!online ? (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-[12.5px] font-semibold text-amber-200">
          Mode hors-ligne — ta liste locale reste utilisable ; les changements se synchroniseront au
          retour du réseau.
        </div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur-sm sm:px-7 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <Link to="/" className="flex items-center gap-3" onClick={() => setView("dashboard")}>
            <span className="flex size-[38px] items-center justify-center rounded-sm bg-lime font-serif text-xl font-semibold text-bg">
              尋
            </span>
            <div className="hidden min-[400px]:block">
              <div className="font-serif text-xl font-semibold tracking-tight">Tsuzuku</div>
              <div className="text-xs text-dim">ta watchlist, en continu</div>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/profile"
              className="relative rounded-[8px] border border-line bg-raised p-2"
              aria-label="Mon profil"
              title="Mon profil"
            >
              <User className="size-4" />
              {badgeCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-bold text-bg">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              ) : null}
            </Link>
            <ThemePicker />
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
        <div className="mt-2.5 w-full min-w-0">
          <AppPrimaryNav />
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[10px] border border-line bg-raised" />
            ))}
          </div>
        ) : view === "dashboard" ? (
          <Dashboard />
        ) : view === "search" ? (
          <SearchView inputRef={searchRef} />
        ) : view === "season" ? (
          <SeasonView />
        ) : view === "roulette" ? (
          <RouletteView />
        ) : (
          <ListView />
        )}
      </main>

      <EntryModal />
      <ImportView open={importOpen} onClose={() => setImportOpen(false)} />
      <ShareSettings open={shareOpen} onClose={() => setShareOpen(false)} />
      <AppToast />
    </div>
  );
}
