import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dices, History, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import {
  collectFacets,
  fetchByGenres,
  fetchTrending,
  kindLabel,
  mediaKind,
  mediaTitle,
  progressText,
  statusMeta,
  type AniListMedia,
  type MediaFormat,
  type StatusKey,
  type WatchlistEntry,
} from "@/lib/watchlist";
import { cn } from "@/lib/utils";
import { useWatchlistStore } from "@/store/watchlist-store";

const POOL_STATUSES: StatusKey[] = ["Plan to Watch", "Watching", "On Hold"];

const GLOBAL_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
] as const;

type FormatFilter = "all" | "series" | "film" | "ova";

type RouletteItem = {
  key: string;
  title: string;
  image: string | null;
  genres: string[];
  year?: number | null;
  format?: MediaFormat;
  score?: number | null;
  entry?: WatchlistEntry;
  media?: AniListMedia;
};

const CARD_W = 120;
const CARD_GAP = 12;
const SPIN_MS = 4200;
const HISTORY_MAX = 5;

function shufflePick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function matchesFormat(
  format: MediaFormat | undefined | null,
  totalEpisodes: number | null | undefined,
  filter: FormatFilter,
) {
  if (filter === "all") return true;
  const kind = mediaKind(format ?? null, totalEpisodes ?? null);
  if (filter === "series") return kind === "series";
  if (filter === "film") return kind === "film";
  if (filter === "ova") return kind === "ova" || kind === "special";
  return true;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RouletteView() {
  const entries = useWatchlistStore((s) => s.entries);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const setView = useWatchlistStore((s) => s.setView);
  const addEntry = useWatchlistStore((s) => s.addEntry);
  const bumpProgress = useWatchlistStore((s) => s.bumpProgress);
  const addedIds = useMemo(() => new Set(entries.map((e) => e.anilistId)), [entries]);

  const facets = useMemo(() => collectFacets(entries), [entries]);
  const [source, setSource] = useState<"list" | "anilist">("list");
  const [genre, setGenre] = useState<string>("Tous");
  const [statusScope, setStatusScope] = useState<"watchable" | "all" | StatusKey>("watchable");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [excludeSession, setExcludeSession] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [globalPool, setGlobalPool] = useState<RouletteItem[]>([]);
  const [winner, setWinner] = useState<RouletteItem | null>(null);
  const [reel, setReel] = useState<RouletteItem[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [history, setHistory] = useState<RouletteItem[]>([]);
  const [sessionSkip, setSessionSkip] = useState<Set<string>>(new Set());

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const listPool: RouletteItem[] = useMemo(() => {
    return entries
      .filter((e) => {
        if (statusScope === "watchable") {
          if (!POOL_STATUSES.includes(e.status)) return false;
        } else if (statusScope !== "all" && e.status !== statusScope) {
          return false;
        }
        if (genre !== "Tous" && !e.genres.includes(genre)) return false;
        if (!matchesFormat(e.format, e.totalEpisodes, formatFilter)) return false;
        if (excludeSession && sessionSkip.has(e.id)) return false;
        return true;
      })
      .map((e) => ({
        key: e.id,
        title: e.title,
        image: e.image,
        genres: e.genres,
        year: e.year,
        format: e.format,
        entry: e,
      }));
  }, [entries, genre, statusScope, formatFilter, excludeSession, sessionSkip]);

  useEffect(() => {
    if (source !== "anilist") return;
    const ac = new AbortController();
    setLoadingPool(true);
    setPoolError("");
    setWinner(null);
    setReel([]);

    void (async () => {
      try {
        let media: AniListMedia[] = [];
        if (genre !== "Tous") {
          media = await fetchByGenres([genre], 50, ac.signal);
        } else {
          media = await fetchTrending(ac.signal);
          // Mix in 2 random genres for more variety beyond pure trending
          const picks = [...GLOBAL_GENRES].sort(() => Math.random() - 0.5).slice(0, 2);
          for (const g of picks) {
            const more = await fetchByGenres([g], 20, ac.signal);
            const seen = new Set(media.map((m) => m.id));
            for (const m of more) {
              if (!seen.has(m.id)) {
                media.push(m);
                seen.add(m.id);
              }
            }
          }
        }
        if (ac.signal.aborted) return;
        setGlobalPool(
          media.map((m) => ({
            key: `al-${m.id}`,
            title: mediaTitle(m),
            image: m.coverImage?.large ?? null,
            genres: m.genres || [],
            year: m.seasonYear,
            format: m.format,
            score: m.averageScore,
            media: m,
          })),
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        setGlobalPool([]);
        setPoolError((err as Error).message || "Impossible de charger AniList");
      } finally {
        if (!ac.signal.aborted) setLoadingPool(false);
      }
    })();

    return () => ac.abort();
  }, [source, genre]);

  const basePool = source === "list" ? listPool : globalPool;
  const pool = useMemo(() => {
    return basePool.filter((item) => {
      if (source === "anilist") {
        if (!matchesFormat(item.format, item.media?.episodes ?? null, formatFilter)) return false;
        if (excludeSession && sessionSkip.has(item.key)) return false;
      }
      return true;
    });
  }, [basePool, source, formatFilter, excludeSession, sessionSkip]);

  const genreOptions = source === "list" ? facets.genres : [...GLOBAL_GENRES];
  const canSpin = !spinning && !loadingPool && pool.length >= 2;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const animateTo = (targetPx: number, onDone: () => void) => {
    const el = trackRef.current;
    if (!el) {
      onDone();
      return;
    }
    if (prefersReducedMotion()) {
      el.style.transform = `translate3d(${-targetPx}px, 0, 0)`;
      onDone();
      return;
    }
    const start = performance.now();
    const duration = SPIN_MS + Math.floor(Math.random() * 800);
    el.style.transform = "translate3d(0px, 0, 0)";
    const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const x = targetPx * easeOutQuint(t);
      el.style.transform = `translate3d(${-x}px, 0, 0)`;
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else onDone();
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const finishSpin = (pick: RouletteItem) => {
    setShowFlash(true);
    setWinner(pick);
    setSpinning(false);
    setHistory((prev) => [pick, ...prev.filter((h) => h.key !== pick.key)].slice(0, HISTORY_MAX));
    window.setTimeout(() => setShowFlash(false), 600);
  };

  const spin = () => {
    if (!canSpin) return;
    setWinner(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const pick = shufflePick(pool);

    if (prefersReducedMotion()) {
      setReel([pick]);
      finishSpin(pick);
      return;
    }

    const BEFORE = 32;
    const AFTER = 16;
    const strip: RouletteItem[] = [];
    for (let i = 0; i < BEFORE; i++) strip.push(shufflePick(pool));
    const winnerIndex = strip.length;
    strip.push(pick);
    for (let i = 0; i < AFTER; i++) strip.push(shufflePick(pool));

    setReel(strip);
    setSpinning(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const track = trackRef.current;
        if (!viewport || !track) return;
        const winnerCard = track.children[winnerIndex] as HTMLElement | undefined;
        if (!winnerCard) return;
        track.style.transform = "translate3d(0, 0, 0)";
        const viewportRect = viewport.getBoundingClientRect();
        const winnerRect = winnerCard.getBoundingClientRect();
        const target =
          winnerRect.left + winnerRect.width / 2 - (viewportRect.left + viewportRect.width / 2);
        animateTo(target, () => finishSpin(pick));
      });
    });
  };

  const skipForSession = (item: RouletteItem) => {
    setSessionSkip((prev) => new Set(prev).add(item.key));
    setWinner(null);
  };

  const poolHint = () => {
    if (loadingPool) return "Chargement du catalogue…";
    if (poolError) return poolError;
    if (pool.length === 0) return "Aucun titre pour ces filtres";
    if (pool.length === 1) return "Il faut au moins 2 titres pour lancer";
    return `${pool.length} titres éligibles`;
  };

  return (
    <div className="animate-fade-up mx-auto max-w-3xl overflow-x-clip">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Roulette</h1>
        <p className="mt-1 text-sm text-dim">
          Le hasard décide — dans ta liste ou dans le catalogue AniList.
        </p>
      </div>

      {/* Source */}
      <div className="mb-3 flex gap-1.5 rounded-[12px] border border-line bg-raised p-1">
        <SourceTab active={source === "list"} onClick={() => !spinning && setSource("list")}>
          Ma liste
        </SourceTab>
        <SourceTab active={source === "anilist"} onClick={() => !spinning && setSource("anilist")}>
          Découverte AniList
        </SourceTab>
      </div>

      {/* Setup */}
      <div className="mb-3 space-y-3 rounded-[12px] border border-line bg-raised p-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-dim">
            Genre
            <select
              value={genre}
              disabled={spinning}
              onChange={(e) => setGenre(e.target.value)}
              className="rounded-[9px] border border-line bg-bg px-2.5 py-2 text-[13px] font-medium text-ink"
            >
              <option value="Tous">Tous</option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          {source === "list" ? (
            <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-dim">
              Statut
              <select
                value={statusScope}
                disabled={spinning}
                onChange={(e) => setStatusScope(e.target.value as typeof statusScope)}
                className="rounded-[9px] border border-line bg-bg px-2.5 py-2 text-[13px] font-medium text-ink"
              >
                <option value="watchable">À voir / en cours / pause</option>
                <option value="all">Toute la liste</option>
                {(["Plan to Watch", "Watching", "On Hold", "Completed", "Dropped"] as StatusKey[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {statusMeta(s).label}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : null}

          <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-dim">
            Format
            <select
              value={formatFilter}
              disabled={spinning}
              onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
              className="rounded-[9px] border border-line bg-bg px-2.5 py-2 text-[13px] font-medium text-ink"
            >
              <option value="all">Tous</option>
              <option value="series">Séries</option>
              <option value="film">Films</option>
              <option value="ova">OVA / Spécial</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-[12.5px] text-dim">
          <input
            type="checkbox"
            checked={excludeSession}
            disabled={spinning}
            onChange={(e) => setExcludeSession(e.target.checked)}
            className="size-4 accent-[var(--color-lime)]"
          />
          Exclure les titres déjà tirés ou ignorés cette session
          {sessionSkip.size > 0 ? (
            <button
              type="button"
              className="ml-1 text-[11px] font-semibold text-lime hover:underline"
              onClick={() => setSessionSkip(new Set())}
            >
              Réinitialiser ({sessionSkip.size})
            </button>
          ) : null}
        </label>
      </div>

      {/* Pool counter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold",
            pool.length >= 2
              ? "border-lime/30 bg-lime/10 text-lime"
              : "border-line bg-raised text-dim",
          )}
        >
          {loadingPool ? <Loader2 className="size-3.5 animate-spin" /> : <Dices className="size-3.5" />}
          {poolHint()}
        </div>
        {poolError && source === "anilist" ? (
          <button
            type="button"
            className="text-[12px] font-semibold text-lime hover:underline"
            onClick={() => setSource("list")}
          >
            Utiliser ma liste
          </button>
        ) : null}
      </div>

      {/* Reel */}
      <div
        ref={viewportRef}
        className={cn(
          "relative mb-5 h-[200px] overflow-hidden rounded-[14px] border border-line bg-raised",
          showFlash && "ring-2 ring-lime/50",
        )}
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-lime shadow-[0_0_12px_var(--color-lime)]" />
        <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-b-md bg-lime px-2 py-0.5 text-[10px] font-bold text-bg">
          ▼
        </div>

        {loadingPool ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-dim">
            <Loader2 className="size-5 animate-spin" /> Chargement…
          </div>
        ) : reel.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            <Dices className="mb-1 size-8 text-dim/50" />
            <p className="text-sm text-dim">
              {pool.length >= 2 ? (
                <>
                  Appuie sur <strong className="text-lime">Lancer</strong>
                </>
              ) : (
                poolHint()
              )}
            </p>
          </div>
        ) : (
          <div
            ref={trackRef}
            className={cn("absolute top-4 left-0 flex", spinning && "opacity-95")}
            style={{
              gap: CARD_GAP,
              paddingLeft: "calc(50% - 60px)",
              transform: "translate3d(0, 0, 0)",
              willChange: "transform",
            }}
          >
            {reel.map((item, i) => (
              <div
                key={`${item.key}-${i}`}
                className="shrink-0 overflow-hidden rounded-[10px] border border-line bg-bg"
                style={{ width: CARD_W }}
              >
                <Cover src={item.image} title={item.title} className="h-[140px] w-full" />
                <div className="truncate px-1.5 py-1 text-center text-[10.5px] font-semibold">
                  {item.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={!canSpin}
          onClick={spin}
          className={cn(
            "inline-flex items-center gap-2 rounded-[10px] bg-lime px-6 py-3 text-sm font-extrabold text-bg",
            "disabled:cursor-not-allowed disabled:opacity-40",
            canSpin && "shadow-[0_0_24px_color-mix(in_oklab,var(--color-lime)_25%,transparent)]",
          )}
        >
          <Dices className={cn("size-5", spinning && "animate-spin")} />
          {spinning ? "Ça tourne…" : "Lancer"}
        </button>

        {source === "list" && pool.length === 0 && !loadingPool ? (
          <p className="text-sm text-dim">
            <button
              type="button"
              className="font-semibold text-lime hover:underline"
              onClick={() => {
                setGenre("Tous");
                setStatusScope("watchable");
                setFormatFilter("all");
              }}
            >
              Élargir les filtres
            </button>
            {" · "}
            <button
              type="button"
              className="font-semibold text-lime hover:underline"
              onClick={() => setView("search")}
            >
              Ajouter des animes
            </button>
          </p>
        ) : null}
      </div>

      {winner && !spinning ? (
        <WinnerCard
          item={winner}
          alreadyInList={winner.media ? addedIds.has(winner.media.id) : true}
          poolSize={pool.length}
          onOpenList={() => {
            if (winner.entry) setActiveEntryId(winner.entry.id);
          }}
          onAdd={() => {
            if (winner.media) addEntry(winner.media);
          }}
          onBump={() => {
            if (winner.entry) bumpProgress(winner.entry.id, 1);
          }}
          onSpin={spin}
          onSkip={() => skipForSession(winner)}
        />
      ) : null}

      {history.length > 0 ? (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-dim">
              <History className="size-3.5" /> Tirages de la session
            </h3>
            <button
              type="button"
              className="text-[11.5px] font-semibold text-dim hover:text-lime"
              onClick={() => setHistory([])}
            >
              Effacer
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {history.map((h, i) => (
              <button
                key={`${h.key}-hist-${i}`}
                type="button"
                onClick={() => {
                  setWinner(h);
                  if (h.entry) setActiveEntryId(h.entry.id);
                }}
                className="flex w-[100px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-raised text-left transition hover:border-lime/40"
              >
                <Cover src={h.image} title={h.title} className="h-[90px] w-full" />
                <div className="line-clamp-2 px-1.5 py-1 text-[10.5px] font-semibold leading-snug">
                  {h.title}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SourceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[9px] px-3 py-2 text-sm font-bold transition-colors",
        active ? "bg-lime text-bg" : "text-dim hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ConfettiBurst() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const pieces = Array.from(container.querySelectorAll<HTMLElement>(".confetti-bit"));
    const reduceMotion = prefersReducedMotion();
    pieces.forEach((piece, i) => {
      const angle = (i / pieces.length) * Math.PI * 2;
      const distance = 90 + ((i * 37) % 100);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 30;
      const rotation = ((i * 73) % 360) - 180;
      const delay = (i % 7) * 18;
      if (reduceMotion) {
        piece.style.opacity = "1";
        piece.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg) scale(0.75)`;
        return;
      }
      piece.animate(
        [
          { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg) scale(1)" },
          {
            opacity: 0,
            transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg) scale(0.4)`,
          },
        ],
        { duration: 900 + (i % 5) * 80, delay, easing: "cubic-bezier(.15,.7,.25,1)", fill: "forwards" },
      );
    });
  }, []);

  const colors = ["var(--color-lime)", "#ff6b9d", "#7dd3fc", "#fbbf24", "#c4b5fd", "#f472b6"];

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute top-1/2 left-1/2 z-20 size-0"
      aria-hidden
    >
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="confetti-bit absolute size-2 rounded-[2px]"
          style={{ background: colors[i % colors.length], opacity: 0 }}
        />
      ))}
    </div>
  );
}

function WinnerCard({
  item,
  alreadyInList,
  poolSize,
  onOpenList,
  onAdd,
  onBump,
  onSpin,
  onSkip,
}: {
  item: RouletteItem;
  alreadyInList: boolean;
  poolSize: number;
  onOpenList: () => void;
  onAdd: () => void;
  onBump: () => void;
  onSpin: () => void;
  onSkip: () => void;
}) {
  const meta = item.entry ? statusMeta(item.entry.status) : null;
  const kind = kindLabel(mediaKind(item.format ?? null, item.entry?.totalEpisodes ?? item.media?.episodes ?? null));
  const why = [
    item.entry ? "dans ta watchlist" : "catalogue AniList",
    item.genres[0] ? item.genres.slice(0, 2).join(" · ") : null,
    poolSize > 0 ? `parmi ${poolSize} titres` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="animate-winner-pop relative overflow-visible rounded-[14px] border border-lime/50 bg-lime/5 p-4 shadow-[0_0_48px_color-mix(in_oklab,var(--color-lime)_12%,transparent)] sm:flex sm:gap-4"
      style={meta ? { ["--accent" as string]: meta.color } : undefined}
    >
      <ConfettiBurst />
      <Cover
        src={item.image}
        title={item.title}
        className="mx-auto h-[180px] w-[128px] shrink-0 rounded-[10px] sm:mx-0"
      />
      <div className="mt-3 min-w-0 flex-1 text-center sm:mt-0 sm:text-left">
        <div className="mb-1 flex items-center justify-center gap-1.5 text-lime sm:justify-start">
          <Sparkles className="size-4" />
          <span className="text-xs font-bold tracking-wide uppercase">Ton tirage</span>
        </div>
        <h2 className="font-serif text-xl font-semibold leading-snug">{item.title}</h2>
        <p className="mt-1 text-sm text-dim">
          {item.entry ? (
            <>
              {meta?.label} · {progressText(item.entry)}
            </>
          ) : (
            "Découverte AniList"
          )}
          {item.year ? ` · ${item.year}` : ""}
          {kind ? ` · ${kind}` : ""}
          {item.score != null ? ` · ${(item.score / 10).toFixed(1)}★` : ""}
        </p>
        {item.genres.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1 sm:justify-start">
            {item.genres.slice(0, 4).map((g) => (
              <span
                key={g}
                className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10.5px] text-dim"
              >
                {g}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11.5px] text-dim/80">{why}</p>

        <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
          {item.entry ? (
            <>
              <button
                type="button"
                onClick={onOpenList}
                className="rounded-[9px] bg-lime px-4 py-2 text-sm font-bold text-bg"
              >
                Ouvrir la fiche
              </button>
              <button
                type="button"
                onClick={onBump}
                className="inline-flex items-center gap-1 rounded-[9px] border border-line bg-raised px-3 py-2 text-sm font-semibold"
              >
                <Plus className="size-3.5" /> +1 épisode
              </button>
            </>
          ) : alreadyInList ? (
            <span className="rounded-[9px] border border-line px-4 py-2 text-sm text-dim">
              Déjà dans ta liste
            </span>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-lime px-4 py-2 text-sm font-bold text-bg"
            >
              <Plus className="size-4" /> Ajouter à ma liste
            </button>
          )}
          <button
            type="button"
            onClick={onSpin}
            className="rounded-[9px] border border-line bg-raised px-4 py-2 text-sm font-semibold"
          >
            Relancer
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1 rounded-[9px] border border-line px-3 py-2 text-sm font-semibold text-dim hover:text-ink"
            title="Ignorer pour cette session"
          >
            <X className="size-3.5" /> Ignorer
          </button>
        </div>
      </div>
    </div>
  );
}
