import { CalendarClock, Play, Plus, Search, Star } from "lucide-react";
import { EntryCard } from "@/components/tsuzuku/entry-card";
import { Cover } from "@/components/tsuzuku/cover";
import { Recommendations } from "@/components/tsuzuku/recommendations";
import { ActivityFeed } from "@/components/tsuzuku/activity-feed";
import {
  computeStats,
  nextAiringText,
  progressText,
  STATUSES,
  statusMeta,
  upcomingThisWeek,
  type WatchlistEntry,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

function sortWatchingPriority(a: WatchlistEntry, b: WatchlistEntry) {
  const aAir = a.nextAiring?.airingAt && a.nextAiring.airingAt > 0 ? a.nextAiring.airingAt : Number.MAX_SAFE_INTEGER;
  const bAir = b.nextAiring?.airingAt && b.nextAiring.airingAt > 0 ? b.nextAiring.airingAt : Number.MAX_SAFE_INTEGER;
  if (aAir !== bAir) return aAir - bAir;
  return +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

export function Dashboard() {
  const entries = useWatchlistStore((s) => s.entries);
  const setView = useWatchlistStore((s) => s.setView);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const applyGenreAndOpenList = useWatchlistStore((s) => s.applyGenreAndOpenList);
  const bumpProgress = useWatchlistStore((s) => s.bumpProgress);

  if (entries.length === 0) {
    return (
      <div className="px-5 py-20 text-center">
        <div className="font-serif text-5xl text-line">見</div>
        <h2 className="font-serif mt-1 text-xl font-medium">Ta watchlist est vide</h2>
        <p className="mt-1 mb-5 text-sm text-dim">
          Cherche un titre et commence à construire ta liste.
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-[18px] py-[11px] text-sm font-bold text-bg"
          onClick={() => setView("search")}
        >
          <Search className="size-4" />
          Chercher un anime
        </button>
      </div>
    );
  }

  const watchingAll = entries.filter((e) => e.status === "Watching").sort(sortWatchingPriority);
  const featured = watchingAll[0] ?? null;
  const otherWatching = watchingAll.slice(1, 4);
  const upcoming = upcomingThisWeek(entries);
  const recent = [...entries]
    .sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt))
    .slice(0, 6);
  const stats = computeStats(entries);

  return (
    <div className="animate-fade-up">
      {/* 1. Continue watching */}
      {featured ? (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h3 className="font-serif text-[17px] font-medium">Continuer</h3>
            {watchingAll.length > 1 ? (
              <button
                type="button"
                className="text-[12px] font-semibold text-lime hover:underline"
                onClick={() => {
                  useWatchlistStore.getState().setStatusFilter("Watching");
                  useWatchlistStore.getState().clearAdvancedFilters();
                  setView("list");
                }}
              >
                Voir tout ({watchingAll.length})
              </button>
            ) : null}
          </div>

          <ContinueHero
            entry={featured}
            onOpen={setActiveEntryId}
            onBump={() => bumpProgress(featured.id, 1)}
          />

          {otherWatching.length > 0 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {otherWatching.map((e) => (
                <ContinueChip key={e.id} entry={e} onOpen={setActiveEntryId} />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mb-7 rounded-[14px] border border-dashed border-line bg-raised/40 px-4 py-6 text-center">
          <p className="text-sm text-dim">Rien en cours pour le moment.</p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-lime hover:underline"
            onClick={() => {
              useWatchlistStore.getState().setStatusFilter("Plan to Watch");
              useWatchlistStore.getState().clearAdvancedFilters();
              setView("list");
            }}
          >
            <Play className="size-3.5" /> Voir ta liste à regarder
          </button>
        </section>
      )}

      {/* 2. Cette semaine */}
      {entries.some((e) => e.status === "Watching") ? (
        <section className="mb-7">
          <h3 className="font-serif mb-3 flex items-center gap-2 text-[17px] font-medium">
            <CalendarClock className="size-4 text-lime" />
            Cette semaine
            {upcoming.length > 0 ? (
              <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-bold text-lime tabular-nums">
                {upcoming.length}
              </span>
            ) : null}
          </h3>
          {upcoming.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {upcoming.map((e) => {
                const label = nextAiringText(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setActiveEntryId(e.id)}
                    className="flex min-w-[200px] max-w-[240px] shrink-0 items-center gap-2.5 rounded-[12px] border border-line bg-raised px-3 py-2.5 text-left transition hover:border-lime/35"
                  >
                    <Cover src={e.image} title={e.title} className="h-12 w-9 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug">{e.title}</div>
                      {label ? (
                        <div className="mt-1 text-[11px] font-bold text-lime">{label}</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-line bg-raised/40 px-4 py-4 text-center text-sm text-dim">
              Aucun épisode annoncé dans les 7 prochains jours.
            </div>
          )}
        </section>
      ) : null}

      {/* 3. Stats compactes */}
      <section className="mb-7">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const n = entries.filter((e) => e.status === s.key).length;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  useWatchlistStore.getState().setStatusFilter(s.key);
                  useWatchlistStore.getState().clearAdvancedFilters();
                  setView("list");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1.5 text-[12px] font-semibold text-dim transition hover:border-lime/40 hover:text-ink"
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
                <span className="tabular-nums text-ink/80">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-dim">
          <span>
            <span className="font-semibold text-ink tabular-nums">{stats.episodesWatched}</span> ép. vus
          </span>
          <span className="text-line">·</span>
          <span>
            Note moy.{" "}
            <span className="font-semibold text-ink tabular-nums">
              {stats.avgRating == null ? "—" : stats.avgRating.toFixed(1)}
            </span>
            {stats.ratedCount ? (
              <span className="text-dim/80"> ({stats.ratedCount})</span>
            ) : null}
          </span>
          {stats.topGenres.length > 0 ? (
            <>
              <span className="text-line">·</span>
              <span className="flex flex-wrap items-center gap-1">
                {stats.topGenres.slice(0, 3).map(([g]) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => applyGenreAndOpenList(g)}
                    className="rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-semibold hover:border-lime hover:text-lime"
                  >
                    {g}
                  </button>
                ))}
              </span>
            </>
          ) : null}
        </div>
      </section>

      {/* 4. Suggestions */}
      <Recommendations />

      {/* 5. Ajouts récents */}
      <section className="mb-7">
        <h3 className="font-serif mb-3 text-[17px] font-medium">Ajouts récents</h3>
        <div className="flex gap-3.5 overflow-x-auto pb-1.5">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} compact onOpen={setActiveEntryId} />
          ))}
        </div>
      </section>

      {/* 6. Activité sociale en bas */}
      <div className="mb-2">
        <ActivityFeed compact />
      </div>
    </div>
  );
}

function ContinueHero({
  entry,
  onOpen,
  onBump,
}: {
  entry: WatchlistEntry;
  onOpen: (id: string) => void;
  onBump: () => void;
}) {
  const meta = statusMeta(entry.status);
  const airing = nextAiringText(entry);
  const banner = entry.bannerImage || entry.image;
  const pct =
    entry.totalEpisodes && entry.totalEpisodes > 0
      ? Math.min(100, Math.round((entry.progress / entry.totalEpisodes) * 100))
      : null;

  return (
    <div
      className="group relative overflow-hidden rounded-[16px] border border-line bg-raised shadow-sm"
      style={{ ["--accent" as string]: meta.color }}
    >
      <button type="button" className="block w-full text-left" onClick={() => onOpen(entry.id)}>
        <div className="relative h-[160px] w-full overflow-hidden sm:h-[200px]">
          {banner ? (
            <img
              src={banner}
              alt=""
              className="size-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
              loading="eager"
            />
          ) : (
            <div className="size-full bg-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          {airing ? (
            <span className="absolute top-3 right-3 rounded-full bg-lime/20 px-2.5 py-1 text-[11.5px] font-bold text-lime backdrop-blur-sm">
              {airing}
            </span>
          ) : null}
        </div>
        <div className="relative -mt-14 px-4 pb-4">
          <div className="line-clamp-2 font-serif text-lg font-semibold leading-snug sm:text-xl">
            {entry.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-dim">
            <span>{progressText(entry)}</span>
            {entry.rating != null ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-lime">
                <Star className="size-3 fill-lime" /> {entry.rating}
              </span>
            ) : null}
          </div>
          {pct != null ? (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      </button>
      <div className="flex gap-2 border-t border-line/80 px-4 py-3">
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-lime/40"
        >
          Voir la fiche
        </button>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onBump();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-lime px-3 py-2 text-[12.5px] font-bold text-bg hover:brightness-105"
        >
          <Plus className="size-3.5" /> +1 épisode
        </button>
      </div>
    </div>
  );
}

function ContinueChip({
  entry,
  onOpen,
}: {
  entry: WatchlistEntry;
  onOpen: (id: string) => void;
}) {
  const airing = nextAiringText(entry);
  const banner = entry.bannerImage || entry.image;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className="relative h-[88px] w-[200px] shrink-0 overflow-hidden rounded-[12px] border border-line text-left transition hover:border-lime/35 sm:w-[220px]"
    >
      {banner ? (
        <img src={banner} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-raised" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/95 via-bg/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <div className="line-clamp-2 text-[12px] font-semibold leading-snug">{entry.title}</div>
        {airing ? <div className="mt-0.5 text-[10.5px] font-bold text-lime">{airing}</div> : null}
      </div>
    </button>
  );
}
