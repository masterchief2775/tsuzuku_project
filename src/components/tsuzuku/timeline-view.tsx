import { useMemo, useState } from "react";
import { CalendarClock, Flag, Infinity as InfinityIcon, TriangleAlert } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import { EmptyState, PageHeader } from "@/components/tsuzuku/ui";
import { cn } from "@/lib/utils";
import { formatAiringTime } from "@/lib/watchlist";
import {
  ASSUMED_EPISODE_INTERVAL_DAYS,
  buildTimeline,
  finishedCount,
  openEndedCount,
  sortTimeline,
  stillAiringCount,
  totalRemaining,
  type TimelineRow,
  type TimelineSort,
} from "@/lib/timeline";
import { useWatchlistStore } from "@/store/watchlist-store";

/**
 * Season timeline — "when does this actually end?"
 *
 * The companion to the calendar: that one answers "what airs today", this one
 * answers "will I ever finish it". Every value comes from the store, so opening
 * this view issues no AniList request at all.
 *
 * The end dates are PROJECTIONS (see `lib/timeline.ts`): AniList publishes only
 * `nextAiringEpisode`, never a schedule, so the interval between episodes is the
 * weekly assumption and the UI says so.
 */

const SORTS: { id: TimelineSort; label: string }[] = [
  { id: "end", label: "Fin estimée" },
  { id: "remaining", label: "Épisodes restants" },
  { id: "next", label: "Prochaine diffusion" },
];

/** Compact duration, French: "3 sem.", "1 an 2 mois". */
function humanDuration(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days < 14) return `${days} j`;
  const weeks = Math.round(days / 7);
  if (days < 70) return `${weeks} sem.`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `${months} mois`;
  const years = Math.floor(days / 365);
  const rest = Math.round((days - years * 365) / 30.44);
  return rest > 0
    ? `${years} an${years > 1 ? "s" : ""} ${rest} mois`
    : `${years} an${years > 1 ? "s" : ""}`;
}

/** "4 mois · janv. 27" for a projected end, or null when there is none. */
function endLabel(row: TimelineRow): string | null {
  if (row.estimatedEndAt == null || row.daysLeft == null) return null;
  const date = new Date(row.estimatedEndAt * 1000).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
  return `${humanDuration(row.daysLeft)} · ${date}`;
}

/** "30 mars 2021" for a series AniList says is over, or null without a full date. */
function endedLabel(row: TimelineRow): string | null {
  if (row.endedAt == null) return null;
  // Pinned to UTC on purpose: `endedAt` is midnight UTC standing for a
  // calendar day with no time, so rendering it in local time showed "29 mars"
  // for a series AniList dates 30 March on any machine west of Greenwich.
  return new Date(row.endedAt * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Positions a bar on a shared axis so rows are comparable at a glance.
 * `span` is the widest projected end across the rows that have one.
 */
function useAxis(rows: TimelineRow[], nowSec: number) {
  return useMemo(() => {
    const ends = rows.map((r) => r.estimatedEndAt).filter((v): v is number => v != null);
    const span = ends.length ? Math.max(...ends) - nowSec : 0;
    const pct = (ts: number | null) => {
      if (ts == null || span <= 0) return 0;
      return Math.max(0, Math.min(100, ((ts - nowSec) / span) * 100));
    };
    return { span, pct };
  }, [rows, nowSec]);
}

function TimelineRowCard({ row, pct }: { row: TimelineRow; pct: (ts: number | null) => number }) {
  const barPct = pct(row.estimatedEndAt);
  const openPct = pct(row.nextAiringAt);

  return (
    <li className="rounded-[12px] border border-line bg-raised p-3">
      <div className="flex items-start gap-3">
        <Cover src={row.image} title={row.title} className="h-16 w-11 shrink-0 rounded-[8px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="truncate text-sm font-bold">{row.title}</h3>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-dim">
              {row.remaining == null
                ? row.openEnded
                  ? "sans fin annoncée"
                  : "?"
                : `${row.remaining} épisode${row.remaining > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Timeline track. Two markers: the next episode (real) and the
              projected end (estimate). A finished series has neither, so the track
              shows watch progress instead — an empty bar there just looked broken. */}
          <div className="relative mt-2 h-2.5 rounded-full bg-bg">
            {row.airingFinished ? (
              <div
                title={
                  row.total == null
                    ? "Progression inconnue"
                    : `${row.progress}/${row.total} épisodes vus`
                }
                className="absolute inset-y-0 left-0 rounded-full bg-ink/40"
                style={{ width: `${Math.round((row.progressRatio ?? 0) * 100)}%` }}
              />
            ) : row.estimatedEndAt != null ? (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-lime/70"
                style={{ width: `${Math.max(2, barPct)}%` }}
              />
            ) : null}
            {row.nextAiringAt != null ? (
              <span
                title={`Ép. ${row.nextEpisode} — ${formatAiringTime(row.nextAiringAt, { withDay: true })}`}
                className={cn(
                  "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-raised",
                  row.estimatedEndAt == null ? "bg-status-hold" : "bg-ink",
                )}
                style={{ left: `${Math.max(1, Math.min(99, openPct))}%` }}
              />
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-dim">
            {row.airingFinished ? (
              <span className="inline-flex items-center gap-1 font-semibold text-ink">
                <Flag className="size-3.5" />
                terminée
                {endedLabel(row) ? ` le ${endedLabel(row)}` : ""}
              </span>
            ) : row.estimatedEndAt != null ? (
              <span className="inline-flex items-center gap-1 font-semibold text-lime">
                <CalendarClock className="size-3.5" />
                fin estimée {endLabel(row)}
              </span>
            ) : row.openEnded ? (
              <span className="inline-flex items-center gap-1">
                <InfinityIcon className="size-3.5" />
                pas de date de fin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="size-3.5" />
                diffusion inconnue
              </span>
            )}
            {row.nextAiringAt != null ? (
              <span>
                ép. {row.nextEpisode} · {formatAiringTime(row.nextAiringAt, { withDay: true })}
              </span>
            ) : null}
            {row.total != null ? (
              <span className="tabular-nums">
                {row.progress}/{row.total}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function TimelineView() {
  const entries = useWatchlistStore((s) => s.entries);
  const [sort, setSort] = useState<TimelineSort>("end");

  // One clock read per render, shared by the axis and every row so the bars and
  // the labels can never disagree.
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = useMemo(() => buildTimeline(entries, nowSec), [entries, nowSec]);
  const sorted = useMemo(() => sortTimeline(rows, sort), [rows, sort]);
  const { pct } = useAxis(sorted, nowSec);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Rien à projeter pour l'instant."
        hint="Rien n'est en cours de diffusion dans ta liste. Passe des titres en « En cours » pour voir ici ce qui se termine, et quand."
      />
    );
  }

  const openEnded = openEndedCount(rows);
  const finished = finishedCount(rows);
  const stillAiring = stillAiringCount(rows);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Projections"
        title="Chronologie"
        description={
          <>
            {totalRemaining(rows)} épisode{totalRemaining(rows) > 1 ? "s" : ""} à regarder sur{" "}
            {rows.length} série{rows.length > 1 ? "s" : ""} suivie{rows.length > 1 ? "s" : ""}.
            {finished > 0 ? ` ${finished} terminée${finished > 1 ? "s" : ""}, à rattraper.` : ""}
            {stillAiring > 0 ? ` ${stillAiring} encore en diffusion.` : ""}
            {openEnded > 0 ? ` ${openEnded} sans date de fin annoncée.` : ""}{" "}
            <span className="text-dim">
              Dates de fin estimées à un épisode par semaine — AniList ne publie que le prochain
              épisode. Les séries terminées affichent leur vraie date de fin.
            </span>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Trier la chronologie">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={sort === s.id}
            onClick={() => setSort(s.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
              sort === s.id
                ? "border-lime bg-lime text-bg"
                : "border-line bg-raised text-dim hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {sorted.map((row) => (
          <TimelineRowCard key={row.id} row={row} pct={pct} />
        ))}
      </ul>

      <p className="mt-4 text-[11.5px] text-dim">
        Intervalle supposé : {ASSUMED_EPISODE_INTERVAL_DAYS} jours par épisode.
      </p>
    </div>
  );
}
