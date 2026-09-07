import { CalendarClock, Search } from "lucide-react";
import { EntryCard } from "@/components/tsuzuku/entry-card";
import { Cover } from "@/components/tsuzuku/cover";
import { Recommendations } from "@/components/tsuzuku/recommendations";
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
import { ActivityFeed } from "@/components/tsuzuku/activity-feed";

export function Dashboard() {
  const entries = useWatchlistStore((s) => s.entries);
  const setView = useWatchlistStore((s) => s.setView);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const applyGenreAndOpenList = useWatchlistStore((s) => s.applyGenreAndOpenList);

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

  const watching = entries.filter((e) => e.status === "Watching").slice(0, 4);
  const upcoming = upcomingThisWeek(entries);
  const recent = [...entries]
    .sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt))
    .slice(0, 4);
  const stats = computeStats(entries);

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <ActivityFeed compact />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
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
              className="rounded-[10px] border border-line border-t-[3px] bg-raised p-3.5 text-left"
              style={{ borderTopColor: s.color }}
            >
              <div className="font-serif text-[28px] leading-none tabular-nums">{n}</div>
              <div className="mt-0.5 text-xs text-dim">{s.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="Épisodes vus" value={String(stats.episodesWatched)} />
        <StatTile
          label="Note moyenne"
          value={stats.avgRating == null ? "—" : stats.avgRating.toFixed(1)}
          hint={stats.ratedCount ? `${stats.ratedCount} noté${stats.ratedCount > 1 ? "s" : ""}` : "Aucune note"}
        />
        <div className="col-span-2 rounded-[10px] border border-line bg-raised p-3.5 sm:col-span-1">
          <div className="text-xs text-dim">Genres préférés</div>
          {stats.topGenres.length === 0 ? (
            <p className="mt-2 text-sm text-dim">Pas encore de genres</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stats.topGenres.map(([g, n]) => (
                <button
                  key={g}
                  type="button"
                  className="rounded-full border border-line bg-bg px-2.5 py-1 text-[11.5px] font-semibold text-dim hover:border-lime hover:text-lime"
                  onClick={() => applyGenreAndOpenList(g)}
                >
                  {g} <span className="tabular-nums text-ink/70">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {entries.some((e) => e.status === "Watching") ? (
        <section className="mb-7">
          <h3 className="font-serif mb-3 flex items-center gap-2 text-[17px] font-medium">
            <CalendarClock className="size-4 text-lime" />
            À venir cette semaine
            {upcoming.length > 0 ? (
              <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-bold text-lime tabular-nums">
                {upcoming.length}
              </span>
            ) : null}
          </h3>
          {upcoming.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-raised">
              {upcoming.map((e) => {
                const label = nextAiringText(e);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-bg/60"
                      onClick={() => setActiveEntryId(e.id)}
                    >
                      <Cover src={e.image} title={e.title} className="h-11 w-8 shrink-0 rounded" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{e.title}</div>
                        <div className="text-[11.5px] text-dim">
                          {e.progress}
                          {e.totalEpisodes ? `/${e.totalEpisodes}` : ""} ép. vus
                        </div>
                      </div>
                      {label ? (
                        <span className="shrink-0 rounded-full bg-lime/15 px-2.5 py-1 text-[11.5px] font-bold text-lime">
                          {label}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[10px] border border-dashed border-line bg-raised/50 px-4 py-5 text-center">
              <p className="text-sm text-dim">
                Aucun épisode annoncé dans les 7 prochains jours.
              </p>
              <p className="mt-1 text-[12px] text-dim/80">
                Les dates se mettent à jour automatiquement pour tes séries en cours.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {watching.length > 0 ? (
        <section className="mb-7">
          <h3 className="font-serif mb-3 text-[17px] font-medium">En cours</h3>
          <div className="flex flex-col gap-3">
            {watching.map((e) => (
              <WatchingBanner key={e.id} entry={e} onOpen={setActiveEntryId} />
            ))}
          </div>
        </section>
      ) : null}

      <Recommendations />

      <section className="mb-7">
        <h3 className="font-serif mb-3 text-[17px] font-medium">Ajouts récents</h3>
        <div className="flex gap-3.5 overflow-x-auto pb-1.5">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} compact onOpen={setActiveEntryId} />
          ))}
        </div>
      </section>
    </div>
  );
}

function WatchingBanner({
  entry,
  onOpen,
}: {
  entry: WatchlistEntry;
  onOpen: (id: string) => void;
}) {
  const meta = statusMeta(entry.status);
  const airing = nextAiringText(entry);
  const banner = entry.bannerImage || entry.image;
  const pct =
    entry.totalEpisodes && entry.totalEpisodes > 0
      ? Math.min(100, Math.round((entry.progress / entry.totalEpisodes) * 100))
      : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className="group relative w-full overflow-hidden rounded-[14px] border border-line bg-raised text-left shadow-sm transition hover:border-lime/30"
      style={{ ["--accent" as string]: meta.color }}
    >
      <div className="relative h-[140px] w-full overflow-hidden sm:h-[168px]">
        {banner ? (
          <img
            src={banner}
            alt=""
            className="size-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="size-full bg-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/10" />
        <span className="absolute top-2.5 left-2.5 rounded-full bg-bg/85 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] backdrop-blur-sm">
          {meta.label}
        </span>
        {airing ? (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-lime/20 px-2.5 py-0.5 text-[11px] font-bold text-lime backdrop-blur-sm">
            {airing}
          </span>
        ) : null}
      </div>
      <div className="relative -mt-10 px-3.5 pb-3.5 pt-0">
        <div className="line-clamp-2 text-[14px] leading-snug font-bold drop-shadow-sm sm:text-[15px]">
          {entry.title}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-dim">
          <span>{progressText(entry)}</span>
          {entry.rating != null ? (
            <span className="font-semibold text-lime">★ {entry.rating}</span>
          ) : null}
        </div>
        {pct != null ? (
          <div className="mt-2 h-1 overflow-hidden rounded bg-line">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
    </button>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-raised p-3.5">
      <div className="font-serif text-[28px] leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-dim">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-dim/70">{hint}</div> : null}
    </div>
  );
}