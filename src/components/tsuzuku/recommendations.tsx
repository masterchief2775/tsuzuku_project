import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { MediaGrid, MediaGridSkeleton } from "@/components/tsuzuku/media-grid";
import {
  canShowRecommendations,
  computeStats,
  fetchByGenres,
  type AniListMedia,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

const recoCache = new Map<string, AniListMedia[]>();

export function Recommendations() {
  const entries = useWatchlistStore((s) => s.entries);
  const addEntry = useWatchlistStore((s) => s.addEntry);

  const eligible = canShowRecommendations(entries);
  const stats = computeStats(entries);
  const topGenres = stats.topGenres.map(([g]) => g).slice(0, 3);
  const cacheKey = topGenres.join("|");
  const owned = new Set(entries.map((e) => e.anilistId));

  const [results, setResults] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!eligible || topGenres.length === 0) {
      setResults([]);
      return;
    }
    const cached = recoCache.get(cacheKey);
    if (cached) {
      setResults(cached.filter((m) => !owned.has(m.id)).slice(0, 6));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const data = await fetchByGenres(topGenres, 24, controller.signal);
        const filtered = data.filter((m) => !owned.has(m.id));
        recoCache.set(cacheKey, filtered);
        if (recoCache.size > 20) {
          const first = recoCache.keys().next().value;
          if (first) recoCache.delete(first);
        }
        setResults(filtered.slice(0, 6));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Suggestions indisponibles pour le moment");
      } finally {
        setLoading(false);
      }
    })();
    return () => abortRef.current?.abort();
    // owned size change should refresh exclusion; genre key drives fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, cacheKey, entries.length]);

  if (!eligible) return null;

  return (
    <section className="mb-7">
      <h3 className="font-serif mb-1 flex items-center gap-2 text-[17px] font-medium">
        <Sparkles className="size-4 text-lime" />
        Suggestions pour toi
      </h3>
      <p className="mb-3 text-[12.5px] text-dim">
        Basé sur tes genres dominants
        {topGenres.length > 0 ? (
          <>
            {" "}
            (
            {topGenres.map((g, i) => (
              <span key={g}>
                {i > 0 ? ", " : ""}
                <span className="text-ink/80">{g}</span>
              </span>
            ))}
            )
          </>
        ) : null}
      </p>
      {error ? <p className="text-sm text-dim">{error}</p> : null}
      {loading ? <MediaGridSkeleton count={6} /> : null}
      {!loading && !error && results.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-line px-4 py-5 text-center text-sm text-dim">
          Pas de suggestion pour l&apos;instant — ajoute d&apos;autres titres notés ou terminés.
        </p>
      ) : null}
      {!loading && results.length > 0 ? (
        <MediaGrid results={results} addedIds={owned} onAdd={addEntry} />
      ) : null}
    </section>
  );
}
