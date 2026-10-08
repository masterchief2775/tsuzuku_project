import { useEffect, useMemo, useRef, useState } from "react";
import { bridgeEndpointIds, buildFranchises, isFamilyRelation, rankFranchises, type Franchise, type FranchiseMember, type MemberStatus } from "@/lib/franchise";
import { CURATED_ORDERS, CURATED_BRIDGES } from "@/lib/franchise-order";
import { fetchMediaRelations, fetchMediaByIds, type AniListMedia, type AniListRelation } from "@/lib/watchlist";
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
/**
 * How many extra titles to fetch relations for, beyond the user's own.
 *
 * AniList relations are one-directional and sparse: owning Fate/Zero surfaces
 * Fate/stay night only after a second hop, and every hop multiplies the ids.
 * The budget bounds a single run (the results are cached, so the cost is paid
 * once), and AniList allows ~90 requests/minute here.
 */
const EXPAND_BUDGET = 240;
/** Hard cap on hops. Depth is what a linear chain needs to be found at all. */
const MAX_HOPS = 6;
/**
 * While a hop stays this small, keep going deeper.
 *
 * A chain like JoJo yields one new title per hop and needs three or four to climb
 * from Steel Ball Run up to Diamond; a hub like ONE PIECE yields 36 at once and
 * is already complete. So depth follows the shape of the graph instead of being
 * a fixed cost for everyone.
 */
const DEEP_EXPANSION_MAX_NEW = 24;
/** Cache entries kept; older ones are dropped so localStorage cannot creep up. */
const CACHE_MAX_ENTRIES = 800;

type CacheEntry = { at: number; relations: AniListRelation[] };
type Cache = Record<string, CacheEntry>;

/** Keeps the cache inside a sane size: most recently written entries win. */
function pruneCache(cache: Cache): Cache {
  const entries = Object.entries(cache);
  if (entries.length <= CACHE_MAX_ENTRIES) return cache;
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
}

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
    localStorage.setItem(CACHE_KEY, JSON.stringify(pruneCache(cache)));
  } catch {
    /* quota exceeded — relations are a cache, losing it is not an error */
  }
}

/** Relation targets worth following: same-story anime, never an adaptation. */
function expandableIds(relations: AniListRelation[]): number[] {
  return relations.filter(isFamilyRelation).map((r) => r.node.id);
}

const BRIDGE_CACHE_KEY = "tsuzuku:bridges";

function readBridgeCache(): Record<number, AniListMedia> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(BRIDGE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AniListMedia>;
    const at = Number(parsed.__at ?? 0);
    // Same TTL as the relations: a title's metadata changes rarely.
    if (at === 0 || Date.now() - at > TTL_MS) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeBridgeCache(next: Record<number, AniListMedia>, previous: Record<number, AniListMedia>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BRIDGE_CACHE_KEY, JSON.stringify({ ...previous, ...next, __at: Date.now() }));
  } catch {
    /* cache only */
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
  /** Metadata of the curated bridge endpoints, keyed by AniList id. */
  const [bridgeById, setBridgeById] = useState<Record<number, AniListMedia>>({});
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

    // Curated bridge metadata first: without it the bridge cannot be attached,
    // and it is at most a handful of ids.
    void (async () => {
      const cached = readBridgeCache();
      const ids = bridgeEndpointIds(CURATED_BRIDGES).filter((id) => !cached[id]);
      if (ids.length === 0) {
        if (isCurrent()) setBridgeById(cached);
        return;
      }
      try {
        const fetched = await fetchMediaByIds(ids);
        if (!isCurrent()) return;
        const next: Record<number, AniListMedia> = {};
        for (const m of fetched) next[m.id] = m;
        writeBridgeCache(next, cached);
        setBridgeById({ ...cached, ...next });
      } catch {
        /* a missing bridge degrades to AniList's own graph, never an error state */
      }
    })();

    const cache = readCache();
    // Seed with the WHOLE cache, not just the user's own titles. The cached
    // relations of the *discovered* members are what the graph is built from, and
    // reading back only the owned ids made a second visit strictly poorer than the
    // first — Stone Ocean vanished from the JoJo franchise because nothing re-ran
    // the walk to rediscover it.
    const working: Cache = { ...cache };
    const now = Date.now();
    const isStale = (id: number) => {
      const hit = cache[String(id)];
      return !hit || now - hit.at > TTL_MS;
    };
    const bridgeIds = bridgeEndpointIds(CURATED_BRIDGES);
    const stale: number[] = [...new Set([...ids, ...bridgeIds])].filter(isStale);

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
        // Each round feeds the next: the relations just fetched reveal further
        // same-franchise titles, which is how a one-hop graph becomes a chain.
        let queue = stale;
        let budget = EXPAND_BUDGET;
        const owned = new Set(ids);
        const attempted = new Set<number>();
        // A curated bridge seeds the walk: the counterpart is exactly what the
        // graph is missing, and everything past it comes from AniList itself.
        for (const id of bridgeIds) if (!working[String(id)]) queue.push(id);
        for (let hop = 0; queue.length > 0 && budget > 0 && hop < MAX_HOPS; hop++) {
          const next: number[] = [];
          for (let i = 0; i < queue.length && budget > 0; i += 50) {
            const batch = queue.slice(i, i + 50).slice(0, budget);
            budget -= batch.length;
            const fetched = await fetchMediaRelations(batch, controller.signal);
            const at = Date.now();
            for (const id of batch) attempted.add(id);
            for (const [id, rel] of fetched) working[String(id)] = { at, relations: rel };
            writeCache(working);
            publish();
            for (const rel of fetched.values()) {
              for (const id of expandableIds(rel)) {
                // Skip what we already have, what the user tracks (their own
                // relations were the first round) and what we asked this run.
                if (working[String(id)] || owned.has(id) || attempted.has(id)) continue;
                next.push(id);
              }
            }
          }
          const discovered = [...new Set(next)].filter((id) => !working[String(id)]);
          // Stop when this hop was expensive: whatever it revealed is fetched now
          // and picked up as a starting point on a later visit.
          queue = discovered.length <= DEEP_EXPANSION_MAX_NEW ? discovered : [];
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
    // Bridge counterparts need their own metadata (title, format, date): a
    // relation node without a format is filtered straight out of the franchise,
    // which would make the bridge a silent no-op.
    const bridgeIds = bridgeEndpointIds(CURATED_BRIDGES);
    const bridgeMedia = new Map(
      bridgeIds
        .map((id) => bridgeById[id])
        .filter((m): m is AniListMedia => Boolean(m))
        .map((m) => [m.id, m]),
    );

    const media: FranchiseMember[] = entries.map((e) => ({
      id: e.anilistId,
      title: e.title,
      image: e.image,
      format: e.format ?? null,
      episodes: e.totalEpisodes ?? null,
      seasonYear: e.year ?? null,
      relations: relations[String(e.anilistId)] ?? [],
    }));
    // Relations fetched for titles the user does not track, so a franchise is
    // not truncated at the titles that happen to be in the watchlist.
    const owned = new Set(entries.map((e) => e.anilistId));
    const extraRelations = new Map<number, AniListRelation[]>();
    for (const [id, rel] of Object.entries(relations)) {
      const num = Number(id);
      if (owned.has(num) || rel.length === 0) continue;
      extraRelations.set(num, rel);
    }
    return rankFranchises(
      buildFranchises({
        media,
        statusOf: (id) => statusById.get(id) ?? null,
        curated: CURATED_ORDERS,
        extraRelations,
        bridges: CURATED_BRIDGES,
        bridgeMedia,
      }),
    );
  }, [entries, relations, statusById, bridgeById]);

  // Titles still missing from the cache: the graph below them is incomplete.
  const pendingCount = useMemo(
    () => entries.filter((e) => relations[String(e.anilistId)] === undefined).length,
    [entries, relations],
  );

  return { franchises, loading, pendingCount, error };
}
