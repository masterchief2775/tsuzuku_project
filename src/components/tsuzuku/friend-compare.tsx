import { useEffect, useState } from "react";
import { ArrowLeftRight, Loader2, X } from "lucide-react";
import {
  compareWatchlists,
  type CompareTitle,
  type WatchlistComparison,
} from "@/lib/friends";
import { cn } from "@/lib/utils";

function TitleRow({ item, meta }: { item: CompareTitle; meta?: string }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {item.image ? (
        <img src={item.image} alt="" className="h-10 w-7 rounded object-cover" />
      ) : (
        <div className="h-10 w-7 rounded bg-line" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{item.title}</div>
        {meta ? <div className="text-[11px] text-dim">{meta}</div> : null}
      </div>
    </li>
  );
}

export function FriendCompareButton({
  friendUserId,
  friendName,
}: {
  friendUserId: string;
  friendName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2 py-1 text-[11.5px] font-semibold text-dim hover:border-lime/40 hover:text-lime"
        title={`Comparer avec ${friendName}`}
      >
        <ArrowLeftRight className="size-3.5" />
        Comparer
      </button>
      {open ? (
        <FriendCompareModal
          friendUserId={friendUserId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function FriendCompareModal({
  friendUserId,
  onClose,
}: {
  friendUserId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<WatchlistComparison | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"common" | "they" | "you" | "watching">("common");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void compareWatchlists({ data: { friendUserId } })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friendUserId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-hidden rounded-[16px] border border-line bg-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Comparaison de watchlists"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="font-serif text-lg font-semibold">Comparaison</h2>
            {data ? (
              <p className="text-[12.5px] text-dim">
                Toi ({data.myCount}) · {data.friend.displayName} ({data.theirCount})
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line p-1.5 text-dim hover:text-ink"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[calc(min(92vh,720px)-3.5rem)] overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12 text-dim">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-crimson">{error}</p>
          ) : data ? (
            <>
              {/* Score */}
              <div className="mb-4 rounded-[14px] border border-lime/35 bg-lime/10 px-4 py-3 text-center">
                <div className="text-[11px] font-bold tracking-wide text-lime uppercase">
                  Compatibilité
                </div>
                <div className="font-serif text-4xl font-semibold text-lime tabular-nums">
                  {data.compatibility}%
                </div>
                <p className="mt-1 text-[12.5px] text-dim">
                  {data.common.length} titre{data.common.length === 1 ? "" : "s"} en commun
                  {" · "}
                  {data.onlyYou} seulement toi · {data.onlyThem} seulement{" "}
                  {data.friend.displayName.split(" ")[0]}
                </p>
              </div>

              {data.genreOverlap.length > 0 ? (
                <div className="mb-4">
                  <div className="mb-1.5 text-[11px] font-bold tracking-wide text-dim uppercase">
                    Genres partagés
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.genreOverlap.map((g) => (
                      <span
                        key={g.genre}
                        className="rounded-full border border-line bg-bg px-2.5 py-1 text-[11.5px] font-semibold"
                      >
                        {g.genre}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mb-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["common", `Commun (${data.common.length})`],
                    ["watching", `En cours (${data.bothWatching.length})`],
                    ["they", `Iel a fini (${data.theyFinishedYouDidNot.length})`],
                    ["you", `Tu as fini (${data.youFinishedTheyDidNot.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
                      tab === id
                        ? "border-lime bg-lime/15 text-lime"
                        : "border-line bg-bg text-dim",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "common" ? (
                data.common.length === 0 ? (
                  <Empty text="Aucun titre en commun pour l’instant." />
                ) : (
                  <ul className="divide-y divide-line/50">
                    {data.common.map((item) => (
                      <TitleRow
                        key={item.anilistId}
                        item={item}
                        meta={[item.myStatus, item.theirStatus]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))}
                  </ul>
                )
              ) : null}

              {tab === "watching" ? (
                data.bothWatching.length === 0 ? (
                  <Empty text="Aucun titre en cours des deux côtés." />
                ) : (
                  <ul className="divide-y divide-line/50">
                    {data.bothWatching.map((item) => (
                      <TitleRow key={item.anilistId} item={item} meta="Vous regardez tous les deux" />
                    ))}
                  </ul>
                )
              ) : null}

              {tab === "they" ? (
                data.theyFinishedYouDidNot.length === 0 ? (
                  <Empty text="Rien de terminé de leur côté que tu n’aies pas fini." />
                ) : (
                  <ul className="divide-y divide-line/50">
                    {data.theyFinishedYouDidNot.map((item) => (
                      <TitleRow
                        key={item.anilistId}
                        item={item}
                        meta={`Toi : ${item.myStatus || "—"}`}
                      />
                    ))}
                  </ul>
                )
              ) : null}

              {tab === "you" ? (
                data.youFinishedTheyDidNot.length === 0 ? (
                  <Empty text="Rien de terminé de ton côté qu’iel n’ait pas fini." />
                ) : (
                  <ul className="divide-y divide-line/50">
                    {data.youFinishedTheyDidNot.map((item) => (
                      <TitleRow
                        key={item.anilistId}
                        item={item}
                        meta={`Eux : ${item.theirStatus || "—"}`}
                      />
                    ))}
                  </ul>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-dim">{text}</p>;
}
