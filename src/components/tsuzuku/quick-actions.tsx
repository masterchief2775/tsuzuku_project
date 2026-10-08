import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUSES, type StatusKey, type WatchlistEntry } from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

export function QuickActions({ entry, compact }: { entry: WatchlistEntry; compact?: boolean }) {
  const bumpProgress = useWatchlistStore((s) => s.bumpProgress);
  const updateEntry = useWatchlistStore((s) => s.updateEntry);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const menuW = 228;
      const pad = 8;
      let left = r.right - menuW;
      if (left < pad) left = pad;
      if (left + menuW > window.innerWidth - pad) left = window.innerWidth - menuW - pad;
      let top = r.bottom + 6;
      // Prefer opening below; if not enough room, open above
      const estimatedH = compact ? 160 : 220;
      if (top + estimatedH > window.innerHeight - pad && r.top > estimatedH) {
        top = r.top - estimatedH - 6;
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function stop(ev: SyntheticEvent) {
    ev.stopPropagation();
  }

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] w-[228px] rounded-[12px] border border-line bg-raised p-2 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
            onClick={stop}
            onPointerDown={stop}
          >
            <button
              type="button"
              role="menuitem"
              className="mb-1 flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-semibold hover:bg-bg"
              onClick={() => {
                bumpProgress(entry.id, 1);
                setOpen(false);
              }}
            >
              <Plus className="size-3.5 text-lime" />
              +1 épisode
            </button>
            <div className="mb-1 px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-dim uppercase">
              Statut
            </div>
            <div className="mb-2 flex flex-wrap gap-1 px-1">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "rounded-full px-2 py-1 text-[10.5px] font-semibold",
                    entry.status === s.key ? "text-bg" : "bg-bg text-dim hover:text-ink",
                  )}
                  style={entry.status === s.key ? { background: s.color } : undefined}
                  onClick={() => {
                    updateEntry(entry.id, { status: s.key as StatusKey });
                    setOpen(false);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {!compact ? (
              <>
                <div className="px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-dim uppercase">
                  Note
                </div>
                <div className="flex flex-wrap gap-0.5 px-1.5 pb-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Note ${n}`}
                      // Keeps the visual size of the icon but grows the tap area
                      // (the negative margin cancels the extra padding).
                      className="-m-2 rounded-[8px] p-2 transition hover:bg-bg"
                      onClick={() => {
                        updateEntry(entry.id, { rating: entry.rating === n ? null : n });
                        setOpen(false);
                      }}
                    >
                      <Star
                        className={cn(
                          "size-3.5",
                          entry.rating != null && entry.rating >= n
                            ? "fill-lime text-lime"
                            : "text-dim",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="absolute top-2 right-2 z-20" onClick={stop} onPointerDown={stop}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Actions rapides"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex size-11 items-center justify-center rounded-full border border-line/60 bg-bg/90 text-ink shadow-sm backdrop-blur-sm md:size-8",
          "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100",
          open && "opacity-100",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu}
    </div>
  );
}

export function HoverPlus({ entry }: { entry: WatchlistEntry }) {
  const bumpProgress = useWatchlistStore((s) => s.bumpProgress);
  return (
    <button
      type="button"
      aria-label="+1 épisode"
      className="absolute bottom-2 right-2 z-10 hidden size-8 items-center justify-center rounded-full bg-lime text-bg shadow-md md:group-hover:flex"
      onClick={(ev) => {
        ev.stopPropagation();
        bumpProgress(entry.id, 1);
      }}
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <Plus className="size-4" />
    </button>
  );
}
