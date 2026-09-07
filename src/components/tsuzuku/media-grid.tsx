import { Loader2, Plus } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import { mediaTitle, searchMetaLine, type AniListMedia } from "@/lib/watchlist";

export function MediaGrid({
  results,
  addedIds,
  onAdd,
}: {
  results: AniListMedia[];
  addedIds: Set<number>;
  onAdd: (m: AniListMedia) => boolean;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5 items-stretch">
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
              className="aspect-[2/3] h-auto w-full shrink-0" imgClassName="object-top"
            />
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5 pb-3">
              <div className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-bold">
                {title}
              </div>
              <div className="mt-1 line-clamp-1 text-[11.5px] text-dim">{searchMetaLine(m)}</div>
              <div className="mt-3 border-t border-line/70 pt-3">
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(m)}
                  className={`inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[12px] font-bold transition ${
                    added
                      ? "cursor-default border border-line bg-bg text-dim"
                      : "bg-lime text-bg shadow-[0_6px_14px_color-mix(in_oklab,var(--color-lime)_18%,transparent)] hover:brightness-105"
                  }`}
                >
                  {added ? (
                    "Dans la liste"
                  ) : (
                    <>
                      <Plus className="size-3.5" />
                      Ajouter
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MediaGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5 items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-raised"
        >
          <div className="aspect-[2/3] w-full animate-pulse bg-line/60" />
          <div className="space-y-2 px-3 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-line/60" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-line/40" />
            <div className="h-8 w-full animate-pulse rounded bg-line/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MediaGridLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-dim">
      <Loader2 className="size-5 animate-spin" />
      Chargement…
    </div>
  );
}
