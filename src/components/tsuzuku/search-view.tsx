import { useEffect, useRef, useState, type RefObject } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import {
  CACHE_LIMIT,
  SEARCH_DEBOUNCE_MS,
  TRENDING_KEY,
  fetchTrending,
  mediaTitle,
  searchAniListQuery,
  searchMetaLine,
  type AniListMedia,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

const searchCache = new Map<string, AniListMedia[]>();

function cacheGetLocal(key: string) {
  if (!searchCache.has(key)) return undefined;
  const v = searchCache.get(key)!;
  searchCache.delete(key);
  searchCache.set(key, v);
  return v;
}
function cacheSetLocal(key: string, value: AniListMedia[]) {
  searchCache.delete(key);
  searchCache.set(key, value);
  if (searchCache.size > CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value!);
}

export function SearchView({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const entries = useWatchlistStore((s) => s.entries);
  const addEntry = useWatchlistStore((s) => s.addEntry);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AniListMedia[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    loadDefault();
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDefault() {
    const cached = cacheGetLocal(TRENDING_KEY);
    if (cached) {
      setResults(cached);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    setSearching(true);
    setError("");
    try {
      const data = await fetchTrending(controller.signal);
      if (id !== requestId.current) return;
      setResults(data);
      cacheSetLocal(TRENDING_KEY, data);
    } catch (err) {
      if ((err as Error).name === "AbortError" || id !== requestId.current) return;
      setError("Impossible de charger les tendances : " + (err as Error).message);
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }

  async function runSearch(q: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    setSearching(true);
    setError("");
    try {
      const data = await searchAniListQuery(q, controller.signal);
      if (id !== requestId.current) return;
      setResults(data);
      cacheSetLocal(q.toLowerCase(), data);
    } catch (err) {
      if ((err as Error).name === "AbortError" || id !== requestId.current) return;
      setError("La recherche a échoué : " + (err as Error).message);
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    // Mid-composition (typing romaji that IME will convert to kana/kanji):
    // keep the input responsive but don't fire a search on every unfinished
    // keystroke — wait for compositionend, handled below.
    if (composingRef.current) return;
    const q = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length === 0) {
      setError("");
      const cached = cacheGetLocal(TRENDING_KEY);
      if (cached) setResults(cached);
      else loadDefault();
      return;
    }
    const cached = cacheGetLocal(q.toLowerCase());
    if (cached) {
      abortRef.current?.abort();
      requestId.current++;
      setResults(cached);
      setError("");
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
  }

  const q = query.trim();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-line bg-raised px-4 py-3 text-dim">
        <Search className="size-4 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(ev) => onQueryChange(ev.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(ev) => {
            composingRef.current = false;
            onQueryChange((ev.target as HTMLInputElement).value);
          }}
          placeholder="Titre japonais, anglais ou romaji…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          aria-label="Rechercher un anime"
        />
        <Loader2
          className={`size-4 ${searching ? "animate-spin visible" : "invisible"}`}
          aria-hidden
        />
      </div>

      {error ? <div className="p-5 text-crimson">{error}</div> : null}

      {!error && q.length === 0 && results.length === 0 && searching ? (
        <SkeletonGrid />
      ) : null}
      {!error && q.length === 0 && results.length === 0 && !searching ? (
        <div className="flex items-center gap-2 p-5 text-dim">
          Commence à écrire pour chercher un anime.
        </div>
      ) : null}
      {!error && q.length === 0 && results.length > 0 ? (
        <>
          <div className="mb-3 text-xs font-semibold text-dim">Tendances du moment</div>
          <ResultsGrid
            results={results}
            query=""
            addedIds={new Set(entries.map((e) => e.anilistId))}
            onAdd={addEntry}
          />
        </>
      ) : null}
      {!error && q.length > 0 && results.length === 0 && searching ? <SkeletonGrid /> : null}
      {!error && q.length > 0 && results.length === 0 && !searching ? (
        <div className="p-5 text-dim">Aucun résultat pour « {query} ».</div>
      ) : null}
      {!error && q.length > 0 && results.length > 0 ? (
        <ResultsGrid
          results={results}
          query={q}
          addedIds={new Set(entries.map((e) => e.anilistId))}
          onAdd={addEntry}
        />
      ) : null}
    </div>
  );
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-lime px-0.5 text-bg">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ResultsGrid({
  results,
  query,
  addedIds,
  onAdd,
}: {
  results: AniListMedia[];
  query: string;
  addedIds: Set<number>;
  onAdd: (m: AniListMedia) => boolean;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3.5 items-stretch">
      {results.map((m) => {
        const title = mediaTitle(m);
        const added = addedIds.has(m.id);
        return (
          <div
            key={m.id}
            className="flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-raised shadow-sm"
          >
            <Cover
              src={m.coverImage?.large}
              title={title}
              className="aspect-[2/3] h-auto w-full shrink-0 object-cover"
            />
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5 pb-3">
              <div className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-bold">
                {highlight(title, query)}
              </div>
              <div className="mt-1 line-clamp-1 text-[11.5px] text-dim">{searchMetaLine(m)}</div>
              <div className="mt-1.5 flex min-h-[22px] flex-wrap gap-1">
                {(m.genres || []).slice(0, 2).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10.5px] text-dim"
                  >
                    {g}
                  </span>
                ))}
              </div>
              {added ? (
                <div className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-line py-2 text-[12px] text-dim">
                  Dans la liste
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-lime py-2 text-[12px] font-bold text-bg hover:brightness-110"
                  onClick={() => onAdd(m)}
                >
                  <Plus className="size-3.5" />
                  Ajouter
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-line bg-raised">
          <div className="h-[210px] animate-pulse bg-line/60" />
          <div className="space-y-2 p-3">
            <div className="h-2.5 rounded bg-line" />
            <div className="h-2.5 w-[55%] rounded bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}
