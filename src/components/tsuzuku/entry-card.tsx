import { Star } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import { Highlight } from "@/components/tsuzuku/highlight";
import { HoverPlus, QuickActions } from "@/components/tsuzuku/quick-actions";
import { cn } from "@/lib/utils";
import { nextAiringText, progressText, statusMeta, type WatchlistEntry } from "@/lib/watchlist";

export function EntryCard({
  entry,
  compact,
  onOpen,
  query = "",
}: {
  entry: WatchlistEntry;
  compact?: boolean;
  onOpen: (id: string) => void;
  query?: string;
}) {
  const meta = statusMeta(entry.status);
  const pct =
    entry.totalEpisodes && entry.totalEpisodes > 0
      ? Math.min(100, Math.round((entry.progress / entry.totalEpisodes) * 100))
      : null;

  return (
    <div
      className={cn(
        "group relative rounded-[12px] border border-line bg-raised text-left shadow-sm",
        compact ? "min-w-[150px] shrink-0" : "",
      )}
      style={{ ["--accent" as string]: meta.color }}
    >
      <button type="button" className="block w-full text-left" onClick={() => onOpen(entry.id)}>
        <div className="relative overflow-hidden rounded-t-[12px]">
          <Cover src={entry.image} title={entry.title} className="h-[210px] w-full" />
          <span className="absolute top-2 left-2 rounded-full bg-bg/85 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
            {meta.label}
          </span>
        </div>
        <div className="px-3 pt-2.5 pb-3">
          <div className="mb-1.5 min-h-[34px] text-[13px] leading-snug font-bold">
            <Highlight text={entry.title} query={query} />
          </div>
          <div className="flex justify-between text-[11.5px] text-dim">
            <span>{progressText(entry)}</span>
            {entry.rating != null ? (
              <span className="flex items-center gap-0.5 text-lime">
                <Star className="size-3 fill-lime" /> {entry.rating}
              </span>
            ) : null}
          </div>
          {nextAiringText(entry) ? (
            <div className="mt-1 text-[11px] font-medium text-lime">{nextAiringText(entry)}</div>
          ) : null}
          {entry.withPeople && entry.withPeople.length > 0 ? (
            <div className="mt-1 truncate text-[10.5px] text-dim">
              avec {entry.withPeople.length} ami{entry.withPeople.length > 1 ? "s" : ""}
            </div>
          ) : null}
          {pct != null ? (
            <div className="mt-2 h-1 overflow-hidden rounded bg-line">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      </button>
      <QuickActions entry={entry} compact={compact} />
      <HoverPlus entry={entry} />
    </div>
  );
}

export function EntryRow({
  entry,
  onOpen,
  query = "",
}: {
  entry: WatchlistEntry;
  onOpen: (id: string) => void;
  query?: string;
}) {
  const meta = statusMeta(entry.status);
  return (
    <div
      className="group relative rounded-[12px] border border-line bg-raised shadow-sm"
      style={{ ["--accent" as string]: meta.color }}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[40px_1fr_auto_auto_auto] items-center gap-3.5 py-2 pr-12 pl-3.5 text-left"
        onClick={() => onOpen(entry.id)}
      >
        <Cover src={entry.image} title={entry.title} className="h-10 w-8 rounded" />
        <div className="truncate text-[13.5px] font-semibold">
          <Highlight text={entry.title} query={query} />
        </div>
        <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
          {meta.label}
        </span>
        <span className="text-xs text-dim">
          {nextAiringText(entry) ?? progressText(entry)}
        </span>
        {entry.rating != null ? (
          <span className="flex items-center gap-0.5 text-lime">
            <Star className="size-3 fill-lime" /> {entry.rating}
          </span>
        ) : (
          <span />
        )}
      </button>
      <QuickActions entry={entry} />
    </div>
  );
}
