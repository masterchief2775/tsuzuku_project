import { CalendarClock, Play, Plus, Search, Star } from "lucide-react";
import { EntryCard } from "@/components/tsuzuku/entry-card";
import { Cover } from "@/components/tsuzuku/cover";
import { Recommendations } from "@/components/tsuzuku/recommendations";
import { ActivityFeed } from "@/components/tsuzuku/activity-feed";
import {
  airingOnDay,
  computeStats,
  nextAiringText,
  progressText,
  startOfDay,
  STATUSES,
  statusMeta,
  upcomingThisWeek,
  type WatchlistEntry,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

function sortWatchingPriority(a: WatchlistEntry, b: WatchlistEntry) {
  const score = (e: WatchlistEntry) => {
    const at = e.nextAiring?.airingAt ?? 0;
    if (at > 0) {
      const now = Math.floor(Date.now() / 1000);
      // Available or imminent first
      if (at <= now) return at; // past = available, sort oldest available first still by time
      return at;
    }
    return Number.MAX_SAFE_INTEGER - Math.floor(+new Date(e.updatedAt) / 1000);
  };
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa - sb;
  return +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

function greetingLabel() {
  const h = new Date().getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function dayBucketLabel(airingAt: number): string {
  const now = new Date();
  const d = new Date(airingAt * 1000);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startThat - startToday) / 86400000);
  if (diffDays < 0) return "Disponible";
  if (diffDays === 0) return "Aujourd’hui";
  if (diffDays === 1) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function groupUpcomingByDay(entries: WatchlistEntry[]) {
  const groups: { label: string; items: WatchlistEntry[] }[] = [];
  const map = new Map<string, WatchlistEntry[]>();
  for (const e of entries) {
    const at = e.nextAiring?.airingAt ?? 0;
    const label = dayBucketLabel(at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  // Preserve chronological order of first appearance
  for (const e of entries) {
    const label = dayBucketLabel(e.nextAiring!.airingAt);
    if (!groups.some((g) => g.label === label)) {
      groups.push({ label, items: map.get(label)! });
    }
  }
  return groups;
}

function isEpisodeAvailable(entry: WatchlistEntry) {
  if (entry.status !== "Watching" || !entry.nextAiring) return false;
  const at = entry.nextAiring.airingAt;
  if (at <= 0 || entry.nextAiring.episode <= 0) return false;
  return at <= Math.floor(Date.now() / 1000);
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
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-[18px] py-[11px] text-sm font-bold text-bg"
            onClick={() => setView("search")}
          >
            <Search className="size-4" />
            Chercher un anime
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[9px] border border-line bg-raised px-[18px] py-[11px] text-sm font-semibold text-ink"
            onClick={() => setView("season")}
          >
            Voir la saison
          </button>
        </div>
      </div>
    );
  }

  const watchingAll = entries.filter((e) => e.status === "Watching").sort(sortWatchingPriority);
  const featured = watchingAll[0] ?? null;
  const otherWatching = watchingAll.slice(1, 5);
  const upcoming = upcomingThisWeek(entries);
  const upcomingGroups = groupUpcomingByDay(upcoming);
  const recent = [...entries]
    .sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt))
    .slice(0, 6);
  const stats = computeStats(entries);
  const todayAiring = airingOnDay(entries, startOfDay(new Date()));

  const availableCount = watchingAll.filter(isEpisodeAvailable).length;

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <p className="text-[12.5px] font-semibold tracking-wide text-dim uppercase">
          {greetingLabel()}
        </p>
        <h2 className="font-serif mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
          {featured
            ? availableCount > 0
              ? availableCount === 1
                ? "Un épisode t’attend"
                : `${availableCount} épisodes t’attendent`
              : "Reprends où tu en étais"
            : "Ta watchlist"}
        </h2>
      </header>

      {todayAiring.length > 0 ? (
        <button
          type="button"
          onClick={() => setView("calendar")}
          className="mb-6 flex w-full items-center gap-3 rounded-[14px] border border-lime/40 bg-lime/10 px-4 py-3 text-left transition hover:border-lime/60"
        >
          <CalendarClock className="size-5 shrink-0 text-lime" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-lime">
              {todayAiring.length === 1
                ? "1 épisode sort aujourd'hui"
                : `${todayAiring.length} épisodes sortent aujourd'hui`}
            </div>
            <div className="truncate text-[12.5px] text-dim">
              {todayAiring
                .slice(0, 3)
                .map((e) => e.title)
                .join(" · ")}
              {todayAiring.length > 3 ? "…" : ""}
            </div>
          </div>
          <span className="shrink-0 text-[12px] font-semibold text-lime">Calendrier →</span>
        </button>
      ) : null}

      {/* 1. Continue watching */}

      {featured ? (
        <section className="mb-8">
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
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {otherWatching.map((e) => (
                <ContinueChip
                  key={e.id}
                  entry={e}
                  onOpen={setActiveEntryId}
                  onBump={() => bumpProgress(e.id, 1)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mb-8 rounded-[14px] border border-dashed border-line bg-raised/40 px-4 py-6 text-center">
          <p className="text-sm text-dim">Rien en cours pour le moment.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-lime hover:underline"
              onClick={() => {
                useWatchlistStore.getState().setStatusFilter("Plan to Watch");
                useWatchlistStore.getState().clearAdvancedFilters();
                setView("list");
              }}
            >
              <Play className="size-3.5" /> Liste à regarder
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-dim hover:text-lime"
              onClick={() => setView("search")}
            >
              <Search className="size-3.5" /> Chercher
            </button>
          </div>
        </section>
      )}

      {/* 2. Cette semaine — groupé par jour */}
      {entries.some((e) => e.status === "Watching") ? (
        <section className="mb-8">
          <h3 className="font-serif mb-3 flex items-center gap-2 text-[17px] font-medium">
            <CalendarClock className="size-4 text-lime" />
            Cette semaine
            {upcoming.length > 0 ? (
              <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-bold text-lime tabular-nums">
                {upcoming.length}
              </span>
            ) : null}
          </h3>
          {upcomingGroups.length > 0 ? (
            <div className="space-y-4">
              {upcomingGroups.map((group) => (
                <div key={group.label}>
                  <div className="mb-2 text-[11px] font-bold tracking-wide text-dim uppercase">
                    {group.label}
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-0.5">
                    {group.items.map((e) => {
                      const label = nextAiringText(e);
                      const available = isEpisodeAvailable(e);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setActiveEntryId(e.id)}
                          className={cn(
                            "flex min-w-[210px] max-w-[250px] shrink-0 items-center gap-2.5 rounded-[12px] border bg-raised px-3 py-2.5 text-left transition hover:border-lime/35",
                            available ? "border-lime/40 bg-lime/5" : "border-line",
                          )}
                        >
                          <Cover src={e.image} title={e.title} className="h-12 w-9 shrink-0 rounded" />
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
                              {e.title}
                            </div>
                            {label ? (
                              <div
                                className={cn(
                                  "mt-1 text-[11px] font-bold",
                                  available ? "text-lime" : "text-lime/90",
                                )}
                              >
                                {label}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-line bg-raised/40 px-4 py-4 text-center text-sm text-dim">
              Aucun épisode annoncé dans les 7 prochains jours.
            </div>
          )}
        </section>
      ) : null}

      {/* 3. Stats compactes */}
      <section className="mb-8">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const n = entries.filter((e) => e.status === s.key).length;
            if (n === 0) return null;
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
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-dim">
          <span>
            <span className="font-semibold text-ink tabular-nums">{stats.episodesWatched}</span> ép.
            vus
          </span>
          <span className="text-line">·</span>
          <span>
            Note{" "}
            <span className="font-semibold text-ink tabular-nums">
              {stats.avgRating == null ? "—" : stats.avgRating.toFixed(1)}
            </span>
            {stats.ratedCount ? <span className="text-dim/80"> ({stats.ratedCount})</span> : null}
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
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h3 className="font-serif text-[17px] font-medium">Ajouts récents</h3>
          <button
            type="button"
            className="text-[12px] font-semibold text-dim hover:text-lime"
            onClick={() => {
              useWatchlistStore.getState().setStatusFilter("Tous");
              useWatchlistStore.getState().clearAdvancedFilters();
              setView("list");
            }}
          >
            Toute la liste
          </button>
        </div>
        <div className="flex gap-3.5 overflow-x-auto pb-1.5">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} compact onOpen={setActiveEntryId} />
          ))}
        </div>
      </section>

      {/* 6. Social */}
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
  const available = isEpisodeAvailable(entry);
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
        <div className="relative h-[168px] w-full overflow-hidden sm:h-[210px]">
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
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/5" />
          {airing ? (
            <span
              className={cn(
                "absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11.5px] font-bold backdrop-blur-sm",
                available ? "bg-lime text-bg" : "bg-lime/20 text-lime",
              )}
            >
              {airing}
            </span>
          ) : null}
        </div>
        <div className="relative -mt-16 px-4 pb-4">
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
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/80">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      </button>
      <div className="flex gap-2 border-t border-line/80 px-4 py-3">
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[12.5px] font-semibold text-ink hover:border-lime/40"
        >
          Voir la fiche
        </button>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onBump();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-lime px-3 py-2.5 text-[12.5px] font-bold text-bg hover:brightness-105"
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
  onBump,
}: {
  entry: WatchlistEntry;
  onOpen: (id: string) => void;
  onBump: () => void;
}) {
  const airing = nextAiringText(entry);
  const available = isEpisodeAvailable(entry);
  const banner = entry.bannerImage || entry.image;

  return (
    <div className="relative h-[96px] w-[210px] shrink-0 overflow-hidden rounded-[12px] border border-line sm:w-[230px]">
      <button type="button" onClick={() => onOpen(entry.id)} className="absolute inset-0 text-left">
        {banner ? (
          <img src={banner} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-raised" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5 pr-12">
          <div className="line-clamp-2 text-[12px] font-semibold leading-snug">{entry.title}</div>
          {airing ? (
            <div className={cn("mt-0.5 text-[10.5px] font-bold", available ? "text-lime" : "text-lime/90")}>
              {airing}
            </div>
          ) : (
            <div className="mt-0.5 text-[10.5px] text-dim">{progressText(entry)}</div>
          )}
        </div>
      </button>
      <button
        type="button"
        aria-label="Ajouter un épisode"
        onClick={(ev) => {
          ev.stopPropagation();
          onBump();
        }}
        className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-lime text-bg shadow-lg hover:brightness-105"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
