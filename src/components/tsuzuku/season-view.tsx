import { useEffect, useRef, useState } from "react";
import { MediaGrid, MediaGridSkeleton } from "@/components/tsuzuku/media-grid";
import { EmptyState, PageHeader } from "@/components/tsuzuku/ui";
import {
  fetchBySeason,
  recentSeasonOptions,
  seasonFromDate,
  type AniListMedia,
  type AniListSeason,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

const seasonCache = new Map<string, AniListMedia[]>();

export function SeasonView() {
  const entries = useWatchlistStore((s) => s.entries);
  const addEntry = useWatchlistStore((s) => s.addEntry);
  const options = recentSeasonOptions();
  const initial = seasonFromDate();

  const [season, setSeason] = useState<AniListSeason>(initial.season);
  const [year, setYear] = useState(initial.year);
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cacheKey = `${season}:${year}:${page}`;

  useEffect(() => {
    void load(1, true);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, year]);

  async function load(p: number, replace: boolean) {
    const key = `${season}:${year}:${p}`;
    const cached = seasonCache.get(key);
    if (cached) {
      setResults((prev) => (replace ? cached : [...prev, ...cached]));
      setPage(p);
      setLoading(false);
      setLoadingMore(false);
      setError("");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (replace) {
      setLoading(true);
      setResults([]);
    } else {
      setLoadingMore(true);
    }
    setError("");
    try {
      const data = await fetchBySeason(season, year, p, controller.signal);
      seasonCache.set(key, data);
      // Keep cache bounded
      if (seasonCache.size > 40) {
        const first = seasonCache.keys().next().value;
        if (first) seasonCache.delete(first);
      }
      setResults((prev) => (replace ? data : [...prev, ...data]));
      setPage(p);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("Impossible de charger la saison : " + (err as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const selectValue = `${season}|${year}`;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Explorer"
        title="Saison en cours"
        description="Parcours les sorties d'une saison et ajoute-les en un clic."
        actions={
          <label className="flex items-center gap-2 text-xs font-semibold text-dim">
            Saison
            <select
              value={selectValue}
              onChange={(e) => {
                const [s, y] = e.target.value.split("|");
                setSeason(s as AniListSeason);
                setYear(Number(y));
              }}
              className="rounded-[10px] border border-line bg-raised px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-lime"
            >
              {options.map((o) => (
                <option key={`${o.season}|${o.year}`} value={`${o.season}|${o.year}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {error ? <div className="mb-4 text-sm text-crimson">{error}</div> : null}
      {loading ? <MediaGridSkeleton count={12} /> : null}
      {!loading && !error && results.length === 0 ? (
        <EmptyState title="Aucun titre pour cette saison." />
      ) : null}
      {!loading && results.length > 0 ? (
        <>
          <MediaGrid
            results={results}
            addedIds={new Set(entries.map((e) => e.anilistId))}
            onAdd={addEntry}
          />
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load(page + 1, false)}
              className="rounded-[9px] border border-line bg-raised px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {loadingMore ? "Chargement…" : "Voir plus"}
            </button>
          </div>
        </>
      ) : null}
      {/* silence unused */}
      <span className="hidden">{cacheKey}</span>
    </div>
  );
}
