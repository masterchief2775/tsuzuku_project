import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ListVideo, Loader2, TriangleAlert } from "lucide-react";
import { PlayerSurface } from "@/components/tsuzuku/player-surface";
import { useWatchSession } from "@/components/tsuzuku/use-watch-session";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { ThemePicker } from "@/components/tsuzuku/theme-picker";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { fetchMediaById } from "@/lib/watchlist";
import {
  buildEpisodes,
  episodeNumberLabel,
  formatClock,
  progressPercent,
  progressRatio,
  resumePosition,
  type Episode,
} from "@/lib/player";
import { readResume } from "@/components/tsuzuku/use-watch-session";
import { cn } from "@/lib/utils";
import { useWatchlistStore } from "@/store/watchlist-store";

/**
 * The watch page — a video player with the episode list and metadata around it.
 *
 * Reached at `/watch?m=<anilistId>&ep=<n>`, deep-linkable and bookmarkable like a
 * real streaming site. No source is connected: the transport is simulated
 * (`use-player-engine`), so the controls, the episode switch, resume and the
 * watchlist sync are all real and testable today.
 */

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Espace / K", action: "Lecture / pause" },
  { keys: "J / ←", action: "Reculer de 10 s" },
  { keys: "L / →", action: "Avancer de 10 s" },
  { keys: "↑ / ↓", action: "Volume" },
  { keys: "M", action: "Couper le son" },
  { keys: "F", action: "Plein écran" },
  { keys: "> / <", action: "Vitesse de lecture" },
  { keys: "0", action: "Revenir au début" },
  { keys: "N / P", action: "Épisode suivant / précédent" },
  { keys: "1 – 9", action: "Aller à 10-90 %" },
  { keys: "Échap", action: "Quitter le lecteur" },
];

function parseEpisodeParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

/**
 * The six home views live in `?v=`, which `Link to="/"` cannot carry as a typed
 * search param (the route has no search validator). Same convention as the nav:
 * a real `href` for the query string.
 */
function homeHref(view: string): string {
  return `/?v=${view}`;
}

export function WatchPage() {
  const search = useSearch({ from: "/watch" }) as { m?: string; ep?: string };
  const entries = useWatchlistStore((s) => s.entries);

  const anilistId = Number(search.m);
  const userId = useCurrentUserState().user?.id;
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);

  // The watch page is a standalone route, so `AppShell` is not mounted and
  // nothing else hydrates the store: without this the episode list stays empty
  // and the player never loads. `hydrate` is idempotent per user.
  useEffect(() => {
    if (userId) hydrate(userId);
  }, [userId, hydrate]);

  const entry = useMemo(
    () => (hydrated ? entries.find((e) => e.anilistId === anilistId) ?? null : null),
    [entries, anilistId, hydrated],
  );

  const [detail, setDetail] = useState<{ title: string; total: number | null; image: string | null } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const requestedEpisode = parseEpisodeParam(search.ep);
  // Fall back to the episode the user has already watched + 1: landing on the
  // next unwatched episode is what "continue watching" means everywhere else.
  const fallbackEpisode = (entry ? Math.min((entry.progress ?? 0) + 1, entry.totalEpisodes ?? 1) : 1) || 1;
  const initialEpisode = requestedEpisode ?? fallbackEpisode;

  const episodes: Episode[] = useMemo(
    () => buildEpisodes(entry?.totalEpisodes ?? 0),
    [entry?.totalEpisodes],
  );

  const session = useWatchSession(anilistId, episodes, initialEpisode);

  // Fetch the title for a media id that is not in the watchlist (a shared link).
  useEffect(() => {
    if (entry || !Number.isFinite(anilistId) || anilistId <= 0) return;
    let cancelled = false;
    setLoadError("");
    void fetchMediaById(anilistId)
      .then((m) => {
        if (cancelled) return;
        setDetail({
          title: m.title.english ?? m.title.romaji ?? `Titre ${anilistId}`,
          total: m.episodes,
          image: m.coverImage?.large ?? null,
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Titre introuvable.");
      });
    return () => {
      cancelled = true;
    };
  }, [anilistId, entry]);

  const title = entry?.title ?? detail?.title ?? (Number.isFinite(anilistId) ? `Titre ${anilistId}` : "Lecteur");

  // No "reprendre" prompt here: the session already restored the position when
  // it loaded (see `resumePosition` in `use-watch-session`), and the episode list
  // shows "reprise à …" per episode. A chip on top of that would offer to resume
  // to the place playback is already at.

  // A plain navigation: the home route carries its view in `?v=`, which
  // `navigate({ to: "/" })` cannot express as a typed search param.
  // Keep the URL on the episode actually playing, whichever way it changed
  // (list click, keyboard shortcut, auto-advance). `history.replaceState` rather
  // than `navigate`: the router JSON-encodes string search params, so a shared
  // link ended up as `?m=%2297940%22`.
  useEffect(() => {
    if (!session.episode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("m", String(anilistId));
    url.searchParams.set("ep", String(session.episodeNumber));
    window.history.replaceState(null, "", url);
  }, [anilistId, session.episodeNumber, session.episode]);

  // A plain navigation: the home route carries its view in `?v=`, which
  // `navigate({ to: "/" })` cannot express as a typed search param.
  const exit = useCallback(() => {
    window.location.assign(homeHref("list"));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.querySelector("[data-player-root]");
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keyboard shortcuts, global while the page is mounted. Skipped when focus is
  // in a field so typing in the episode filter never triggers playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Space and Enter activate a focused control natively. Handling them here
      // too would toggle playback twice (once from the button's click, once from
      // the shortcut) and appear to do nothing.
      if (
        (e.key === " " || e.key === "Enter") &&
        target &&
        (target.tagName === "BUTTON" || target.tagName === "A")
      ) {
        return;
      }
      const action = session.shortcutForKey(e.key);
      if (!action) return;
      if (action === "close") {
        e.preventDefault();
        exit();
        return;
      }
      if (action === "toggle-fullscreen") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      e.preventDefault();
      session.applyAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, exit, toggleFullscreen]);

  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-serif text-xl font-semibold">Aucun titre à lire</h1>
        <p className="mt-2 text-sm text-dim">
          Ce lien de lecteur est incomplet. Ouvre un titre depuis ta liste pour lancer la lecture.
        </p>
        <Link to={homeHref("list")} className="mt-4 inline-block text-sm font-semibold text-lime">
          Aller à ma liste
        </Link>
      </main>
    );
  }

  const watchedCount = episodes.filter((e) => resumePosition(readResume(anilistId, e.number), e.duration) != null).length;

  return (
    <div className="ambient-bg flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:px-7">
        <div className="flex w-full items-center gap-3">
          <Link to="/" className="flex items-center gap-3" aria-label="Accueil">
            <BrandMark />
            <div className="hidden min-[400px]:block">
              <div className="font-serif text-xl font-semibold tracking-tight">Tsuzuku</div>
              <div className="text-xs text-dim">ta watchlist, en continu</div>
            </div>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg font-semibold">{title}</h1>
            <p className="truncate text-xs text-dim">
              {session.episode ? episodeNumberLabel(session.episodeNumber) : "Aucun épisode"}
              {entry?.totalEpisodes ? ` · ${entry.totalEpisodes} épisodes` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemePicker />
            <UserButton />
            <button
              type="button"
              onClick={exit}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-2 text-xs font-semibold text-dim transition hover:border-lime/40 hover:text-ink"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-5 sm:px-7">
        <div data-player-root className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            {loadError ? (
              <p role="alert" className="mb-3 text-sm text-crimson">
                {loadError}
              </p>
            ) : null}

            {/* Wait for the episode itself, not just for a non-empty list: the
                engine is built from the episode duration, and mounting it with a
                zero duration let the resume effect fire a `reset` that silently
                cancelled the play the viewer had just started. */}
            {!hydrated || !session.episode ? (
              <div className="grid aspect-[4/3] place-items-center rounded-[12px] border border-dashed border-line bg-raised sm:aspect-video">
                <div className="px-6 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-dim" />
                  <p className="mt-3 text-sm text-dim">
                    {!hydrated
                      ? "Chargement de ta liste…"
                      : entry
                        ? "Ce titre n'a pas d'épisodes à lire."
                        : "Chargement du titre…"}
                  </p>
                  {hydrated && !entry ? (
                    <p className="mt-1 text-[12px] text-dim">
                      Ce titre n&apos;est pas dans ta liste : ajoute-le pour suivre ta progression ici.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="relative">
                <PlayerSurface
                  engine={session.engine}
                  title={title}
                  episodeLabel={session.episode ? episodeNumberLabel(session.episodeNumber) : ""}
                  onNext={session.next != null ? () => session.goTo(session.next) : null}
                  onPrevious={session.previous != null ? () => session.goTo(session.previous) : null}
                  onExit={exit}
                  onToggleFullscreen={toggleFullscreen}
                  isFullscreen={isFullscreen}
                  skipCueLabel={session.activeCue ? skipLabel(session.activeCue.kind) : null}
                  onSkip={session.skipActiveCue}
                  onShortcuts={() => setShortcutsOpen(true)}
                />

                {shortcutsOpen ? (
                  <div
                    role="dialog"
                    aria-label="Raccourcis clavier"
                    className="absolute inset-0 z-10 grid place-items-center rounded-[12px] bg-black/80 p-6 backdrop-blur"
                    onClick={() => setShortcutsOpen(false)}
                  >
                    <div
                      className="w-full max-w-sm rounded-[12px] border border-line bg-raised p-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2 className="font-serif text-base font-semibold">Raccourcis clavier</h2>
                      <dl className="mt-3 space-y-1.5">
                        {SHORTCUTS.map((s) => (
                          <div key={s.keys} className="flex items-center justify-between gap-3 text-[12.5px]">
                            <dt className="text-dim">{s.action}</dt>
                            <dd className="shrink-0 rounded bg-bg px-1.5 py-0.5 font-bold tabular-nums">
                              {s.keys}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <button
                        type="button"
                        onClick={() => setShortcutsOpen(false)}
                        className="mt-4 w-full rounded-[9px] bg-lime py-2 text-[12.5px] font-bold text-bg"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Below the player: a single information band. It used to be a stacked
                poster/title block, which left the whole right half of a wide
                screen empty. */}
            <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-[12px] border border-line bg-raised p-3.5">
              {entry?.image || detail?.image ? (
                <img
                  src={entry?.image ?? detail?.image ?? ""}
                  alt=""
                  className="h-24 w-16 shrink-0 rounded-[8px] border border-line object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-base font-semibold">{title}</h2>
                <p className="mt-0.5 text-[12px] text-dim">
                  {session.episode
                    ? `${episodeNumberLabel(session.episodeNumber)} · ${formatClock(session.episode.duration)}`
                    : "Sélectionne un épisode"}
                  {episodes.length > 0 ? ` · ${episodes.length} épisodes` : ""}
                  {session.engine.rate !== 1 ? ` · lecture ${session.engine.rate}×` : ""}
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-[11px] text-dim">
                  <TriangleAlert className="size-3 shrink-0" />
                  Aucune source connectée — lecture simulée, progression bien enregistrée
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {entry ? (
                  <>
                    <button
                      type="button"
                      onClick={() => session.engine.seek(0)}
                      className="rounded-[9px] border border-line px-3 py-1.5 text-[12px] font-semibold text-dim transition hover:border-lime/40 hover:text-ink"
                    >
                      Revoir depuis le début
                    </button>
                    {session.next != null ? (
                      <button
                        type="button"
                        onClick={() => session.goTo(session.next)}
                        className="rounded-[9px] bg-lime px-3 py-1.5 text-[12px] font-bold text-bg transition hover:brightness-110"
                      >
                        Épisode suivant
                      </button>
                    ) : null}
                  </>
                ) : (
                  <Link
                    to={homeHref("search")}
                    className="rounded-[9px] bg-lime px-3 py-1.5 text-[12px] font-bold text-bg"
                  >
                    Ajouter à ma liste
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Episode list */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[12px] border border-line bg-raised">
              <button
                type="button"
                onClick={() => setEpisodesOpen((v) => !v)}
                aria-expanded={episodesOpen}
                className="flex w-full items-center gap-2 border-b border-line px-3.5 py-3 text-left lg:cursor-default"
              >
                <ListVideo className="size-4 shrink-0 text-lime" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold">Épisodes</span>
                  <span className="block text-[11px] text-dim">
                    {episodes.length === 0
                      ? "aucun"
                      : `${episodes.length} au total${
                          watchedCount > 0
                            ? ` · ${watchedCount} commencé${watchedCount > 1 ? "s" : ""}`
                            : ""
                        }`}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-dim transition-transform lg:hidden",
                    episodesOpen && "rotate-180",
                  )}
                />
              </button>

              <div className={cn("lg:block", episodesOpen ? "block" : "hidden")}>
                <ol className="max-h-[26rem] overflow-y-auto lg:max-h-[calc(100dvh-17rem)]">
                  {episodes.map((ep) => {
                    const current = ep.number === session.episodeNumber;
                    // Same floor as the player: a few seconds in is not a
                    // position worth resuming, so the row must not promise it.
                    const saved = resumePosition(readResume(anilistId, ep.number), ep.duration);
                    const done = saved != null && progressRatio(saved, ep.duration) >= 0.9;
                    return (
                      <li key={ep.number}>
                        <button
                          type="button"
                          onClick={() => {
                            session.goTo(ep.number);
                            setEpisodesOpen(false);
                          }}
                          aria-current={current ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2.5 border-b border-line/50 px-3.5 py-2 text-left transition",
                            current ? "bg-lime/12" : "hover:bg-bg/60",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-[7px] text-[11px] font-bold tabular-nums",
                              current ? "bg-lime text-bg" : done ? "bg-lime/20 text-lime" : "bg-bg text-dim",
                            )}
                          >
                            {done ? "✓" : ep.number}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-[12.5px] font-semibold",
                                current ? "text-ink" : "text-dim",
                              )}
                            >
                              {episodeNumberLabel(ep.number)}
                              {current ? " · en cours" : ""}
                            </span>
                            <span className="block truncate text-[11px] text-dim">
                              {done
                                ? "terminé"
                                : saved != null
                                  ? `reprise à ${formatClock(saved)} · ${progressPercent(saved, ep.duration)} %`
                                  : formatClock(ep.duration)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {episodes.length === 0 ? (
                    <li className="px-3.5 py-6 text-center text-[12.5px] text-dim">
                      Ce titre n&apos;a pas de nombre d&apos;épisodes connu. Ajoute-le à ta liste pour
                      voir ses épisodes ici.
                    </li>
                  ) : null}
                </ol>
              </div>
            </div>

            <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
              Épisodes listés d&apos;après AniList. Les durées sont estimées tant qu&apos;aucune source
              n&apos;est branchée.
            </p>
          </aside>
        </div>
      </main>

      <AppFooter publicPage />
    </div>
  );
}

function skipLabel(kind: "intro" | "ending"): string {
  return kind === "intro" ? "Passer l'intro" : "Passer le générique";
}
