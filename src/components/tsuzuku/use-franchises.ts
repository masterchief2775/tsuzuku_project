import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildFranchises,
  rankFranchises,
  type Franchise,
  type FranchiseMember,
  type MemberStatus,
} from "@/lib/franchise";
import { CURATED_ORDERS } from "@/lib/franchise-order";
import { fetchMediaRelations, type AniListRelation } from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

/**
 * Relations are cached in localStorage with a TTL instead of being refetched.
 *
 * Two reasons, both measured in this app:
 *  - AniList allows ~90 requests/minute with no API key here. A watchlist of 60
 *    titles would need several requests to walk the relation graph, and every
 *    reopen of the view would repeat them.
 *  - Relations for a given title change rarely (a new sequel every season), so a
 *    long TTL costs nothing in freshness.
 *
 * Requests are strictly incremental: only ids that are missing OR past their TTL
 * are requested, in batches of 50, one batch at a time.
 */

const CACHE_KEY = "tsuzuku:relations";
/** 30 days. A franchise only changes when AniList adds or re-edges a title. */
const TTL_MS = 30 * 86400_000;

type CacheEntry = { at: number; relations: AniListRelation[] };
type Cache = Record<string, CacheEntry>;

function readCache(): Cache {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Cache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded — relations are a cache, losing it is not an error */
  }
}

export type UseFranchises = {
  franchises: Franchise[];
  loading: boolean;
  /** Titles whose relations are not known yet; the graph is partial until then. */
  pendingCount: number;
  error: string;
};

export function useFranchises(): UseFranchises {
  const entries = useWatchlistStore((s) => s.entries);
  const [relations, setRelations] = useState<Record<string, AniListRelation[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Identifies the newest run. Only that one may touch state, which keeps a
  // slow run from overwriting a fresher result — and guarantees `loading` is
  // always settled by someone.
  const runRef = useRef(0);

  const idsKey = useMemo(
    () =>
      [...new Set(entries.map((e) => e.anilistId))].sort((a, b) => a - b).join(","),
    [entries],
  );

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",").map(Number) : [];
    if (ids.length === 0) {
      abortRef.current?.abort();
      setRelations({});
      setLoading(false);
      return;
    }

    const runId = ++runRef.current;
    const isCurrent = () => runRef.current === runId;

    const cache = readCache();
    const working: Cache = {};
    const stale: number[] = [];
    for (const id of ids) {
      const hit = cache[String(id)];
      if (!hit || Date.now() - hit.at > TTL_MS) {
        stale.push(id);
        working[String(id)] = hit ?? { at: 0, relations: [] };
      } else {
        working[String(id)] = hit;
      }
    }

    const publish = () => {
      if (!isCurrent()) return;
      const next: Record<string, AniListRelation[]> = {};
      for (const [id, entry] of Object.entries(working)) {
        if (entry.relations.length > 0 || entry.at > 0) next[id] = entry.relations;
      }
      setRelations(next);
    };
    publish();

    if (stale.length === 0) {
      setLoading(false);
      return;
    }

    // Cancel the previous run, never the current one on unmount: aborting on
    // cleanup used to strand `loading` at true forever when the effect re-ran.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    void (async () => {
      try {
        // One batch at a time: parallel requests are what trips AniList's limit.
        for (let i = 0; i < stale.length; i += 50) {
          const batch = stale.slice(i, i + 50);
          const fetched = await fetchMediaRelations(batch, controller.signal);
          const at = Date.now();
          for (const [id, rel] of fetched) working[String(id)] = { at, relations: rel };
          writeCache(working);
          publish();
        }
        if (isCurrent()) setError("");
      } catch (err) {
        if (!isCurrent()) return;
        setError(
          err instanceof Error ? err.message : "Impossible de lire les franchises sur AniList.",
        );
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
  }, [idsKey]);

  const statusById = useMemo(() => {
    const map = new Map<number, MemberStatus>();
    for (const e of entries) map.set(e.anilistId, e.status as MemberStatus);
    return map;
  }, [entries]);

  const franchises = useMemo<Franchise[]>(() => {
    const media: FranchiseMember[] = entries.map((e) => ({
      id: e.anilistId,
      title: e.title,
      image: e.image,
      format: e.format ?? null,
      episodes: e.totalEpisodes ?? null,
      seasonYear: e.year ?? null,
      relations: relations[String(e.anilistId)] ?? [],
    }));
    return rankFranchises(
      buildFranchises({
        media,
        statusOf: (id) => statusById.get(id) ?? null,
        curated: CURATED_ORDERS,
      }),
    );
  }, [entries, relations, statusById]);

  // Titles still missing from the cache: the graph below them is incomplete.
  const pendingCount = useMemo(
    () => entries.filter((e) => relations[String(e.anilistId)] === undefined).length,
    [entries, relations],
  );

  return { franchises, loading, pendingCount, error };
}
