import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dices, Loader2, Plus, Sparkles } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import {
  collectFacets,
  fetchByGenres,
  fetchTrending,
  mediaTitle,
  progressText,
  statusMeta,
  type AniListMedia,
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

type RouletteItem = {
  key: string;
  title: string;
  image: string | null;
  genres: string[];
  entry?: WatchlistEntry;
  media?: AniListMedia;
};

const CARD_W = 120;
const CARD_GAP = 12;
const STEP = CARD_W + CARD_GAP;
const SPIN_MS = 4000;

function shufflePick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function RouletteView() {
  const entries = useWatchlistStore((s) => s.entries);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const setView = useWatchlistStore((s) => s.setView);
  const addEntry = useWatchlistStore((s) => s.addEntry);
  const addedIds = useMemo(() => new Set(entries.map((e) => e.anilistId)), [entries]);

  const facets = useMemo(() => collectFacets(entries), [entries]);
  const [source, setSource] = useState<"list" | "anilist">("list");
  const [genre, setGenre] = useState<string>("Tous");
  const [statusScope, setStatusScope] = useState<"watchable" | "all" | StatusKey>("watchable");
  const [spinning, setSpinning] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [globalPool, setGlobalPool] = useState<RouletteItem[]>([]);
  const [winner, setWinner] = useState<RouletteItem | null>(null);
  const [reel, setReel] = useState<RouletteItem[]>([]);

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
        return true;
      })
      .map((e) => ({
        key: e.id,
        title: e.title,
        image: e.image,
        genres: e.genres,
        entry: e,
      }));
  }, [entries, genre, statusScope]);

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
          if (media.length < 20) {
            const more = await fetchByGenres(["Action"], 30, ac.signal);
            const seen = new Set(media.map((m) => m.id));
            for (const m of more) {
              if (!seen.has(m.id)) media.push(m);
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

  const pool = source === "list" ? listPool : globalPool;
  const genreOptions = source === "list" ? facets.genres : [...GLOBAL_GENRES];

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
    // Prefer pure JS animation — survives prefers-reduced-motion CSS overrides
    // that force transition-duration: 0.01ms on every element.
    const start = performance.now();
    const from = 0;
    el.style.transform = `translate3d(0px, 0, 0)`;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const x = from + (targetPx - from) * easeOutCubic(t);
      el.style.transform = `translate3d(${-x}px, 0, 0)`;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const spin = () => {
    if (spinning || loadingPool || pool.length === 0) return;
    setWinner(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const pick = shufflePick(pool);
    // Before + winner + after → looks infinite (cards keep scrolling past the marker)
    const BEFORE = 32;
    const AFTER = 16;
    const strip: RouletteItem[] = [];
    for (let i = 0; i < BEFORE; i++) strip.push(shufflePick(pool));
    const winnerIndex = strip.length;
    strip.push(pick);
    for (let i = 0; i < AFTER; i++) strip.push(shufflePick(pool));

    setReel(strip);
    setSpinning(true);

    // Stop exactly on the winner card (not at the end of the strip)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = winnerIndex * STEP;
        animateTo(target, () => {
          setWinner(pick);
          setSpinning(false);
        });
      });
    });
  };

  return (
    <div className="mx-auto max-w-3xl overflow-x-hidden">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Roulette</h1>
        <p className="mt-1 text-sm text-dim">
          Le hasard décide — dans ta liste ou dans tout le catalogue AniList.
        </p>
      </div>

      <div className="mb-4 flex gap-1.5 rounded-[10px] border border-line bg-raised p-1">
        <SourceTab active={source === "list"} onClick={() => !spinning && setSource("list")}>
          Ma liste
        </SourceTab>
        <SourceTab active={source === "anilist"} onClick={() => !spinning && setSource("anilist")}>
          Tous les animes
        </SourceTab>
      </div>

      <div className="mb-5 flex flex-wrap gap-3 rounded-[12px] border border-line bg-raised p-4">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-dim">
          Genre
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            disabled={spinning}
            className="rounded-[9px] border border-line bg-bg px-3 py-2 text-sm font-semibold text-ink"
          >
            <option value="Tous">Tous les genres</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {source === "list" ? (
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-dim">
            Statut
            <select
              value={statusScope}
              onChange={(e) => setStatusScope(e.target.value as typeof statusScope)}
              disabled={spinning}
              className="rounded-[9px] border border-line bg-bg px-3 py-2 text-sm font-semibold text-ink"
            >
              <option value="watchable">À regarder / En cours / Pause</option>
              <option value="all">Toute la liste</option>
              <option value="Plan to Watch">À regarder seulement</option>
              <option value="Watching">En cours seulement</option>
              <option value="On Hold">En pause seulement</option>
              <option value="Completed">Terminés</option>
            </select>
          </label>
        ) : (
          <div className="flex min-w-[160px] flex-1 flex-col justify-end gap-1 text-[11.5px] text-dim">
            <span className="font-semibold">Source</span>
            <span className="rounded-[9px] border border-line bg-bg px-3 py-2 text-sm text-ink">
              Catalogue AniList
            </span>
          </div>
        )}
      </div>

      <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-dim">
        {loadingPool ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Chargement du catalogue…
          </>
        ) : (
          <>
            {pool.length} titre{pool.length > 1 ? "s" : ""} dans le tirage
            {genre !== "Tous" ? ` · ${genre}` : ""}
            {source === "anilist" ? " · AniList" : ""}
          </>
        )}
      </p>
      {poolError ? <p className="mb-3 text-sm text-red-400">{poolError}</p> : null}

      {/* Viewport — clipped box so nothing (text or cards) escapes */}
      <div
        ref={viewportRef}
        className="relative mb-6 h-[200px] w-full max-w-full overflow-hidden rounded-[14px] border border-line bg-raised"
        style={{ contain: "paint", isolation: "isolate" }}
      >
        {/* Center marker */}
        <div className="pointer-events-none absolute top-2 bottom-2 left-1/2 z-20 w-[128px] -translate-x-1/2 rounded-[12px] border-2 border-lime shadow-[0_0_24px_rgba(200,255,77,0.2)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-gradient-to-r from-raised to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-raised to-transparent" />

        {reel.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center px-3">
            <p className="m-0 truncate text-center text-[13px] text-dim">
              Appuie sur <strong className="text-lime">Lancer</strong>
            </p>
          </div>
        ) : (
          <div
            ref={trackRef}
            className="absolute top-4 left-0 flex"
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

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={spinning || loadingPool || pool.length === 0}
          onClick={spin}
          className={cn(
            "inline-flex items-center gap-2 rounded-[10px] bg-lime px-6 py-3 text-sm font-extrabold text-bg",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Dices className={cn("size-5", spinning && "animate-spin")} />
          {spinning ? "Ça tourne…" : "Lancer"}
        </button>
        {source === "list" && pool.length === 0 && !loadingPool ? (
          <p className="text-sm text-dim">
            Aucun titre pour ces filtres.{" "}
            <button
              type="button"
              className="font-semibold text-lime"
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
          onOpenList={() => {
            if (winner.entry) setActiveEntryId(winner.entry.id);
          }}
          onAdd={() => {
            if (winner.media) addEntry(winner.media);
          }}
          onSpin={spin}
        />
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
        "flex-1 rounded-[8px] px-3 py-2 text-sm font-bold transition-colors",
        active ? "bg-lime text-bg" : "text-dim hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function WinnerCard({
  item,
  alreadyInList,
  onOpenList,
  onAdd,
  onSpin,
}: {
  item: RouletteItem;
  alreadyInList: boolean;
  onOpenList: () => void;
  onAdd: () => void;
  onSpin: () => void;
}) {
  const meta = item.entry ? statusMeta(item.entry.status) : null;
  return (
    <div
      className="mt-8 overflow-hidden rounded-[14px] border border-lime/40 bg-lime/5 p-4 sm:flex sm:gap-4"
      style={meta ? { ["--accent" as string]: meta.color } : undefined}
    >
      <Cover
        src={item.image}
        title={item.title}
        className="mx-auto h-[180px] w-[130px] shrink-0 rounded-[10px] sm:mx-0"
      />
      <div className="mt-3 min-w-0 flex-1 text-center sm:mt-0 sm:text-left">
        <div className="mb-1 flex items-center justify-center gap-1.5 text-lime sm:justify-start">
          <Sparkles className="size-4" />
          <span className="text-xs font-bold tracking-wide uppercase">Ton tirage</span>
        </div>
        <h2 className="font-serif text-xl font-semibold">{item.title}</h2>
        <p className="mt-1 text-sm text-dim">
          {item.entry ? (
            <>
              {meta?.label} · {progressText(item.entry)}
            </>
          ) : (
            "Catalogue AniList"
          )}
          {item.genres[0] ? ` · ${item.genres.slice(0, 3).join(", ")}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
          {item.entry ? (
            <button
              type="button"
              onClick={onOpenList}
              className="rounded-[9px] bg-lime px-4 py-2 text-sm font-bold text-bg"
            >
              Ouvrir la fiche
            </button>
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
              <Plus className="size-4" />
              Ajouter à ma liste
            </button>
          )}
          <button
            type="button"
            onClick={onSpin}
            className="rounded-[9px] border border-line bg-raised px-4 py-2 text-sm font-semibold"
          >
            Relancer
          </button>
        </div>
      </div>
    </div>
  );
}
