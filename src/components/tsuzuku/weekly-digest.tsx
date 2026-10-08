import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarRange, RotateCw } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { SectionTitle } from "@/components/tsuzuku/ui";
import { getWeeklyDigest, type DigestItem } from "@/lib/activity";

function kindText(item: DigestItem): string {
  const n = item.count;
  const times = n > 1 ? ` (${n}×)` : "";
  switch (item.kind) {
    case "completed":
      return `a terminé ${item.sampleTitle || "un titre"}${times}`;
    case "rated":
      return `a noté ${item.sampleTitle || "un titre"}${times}`;
    case "friend_request":
      return `demandes d’ami${times}`;
    case "friend_accept":
      return `nouveaux amis${times}`;
    case "list_add":
      return `a ajouté ${item.sampleTitle || "un titre"} à une liste${times}`;
    case "list_join":
      return `a rejoint ${item.sampleTitle || "une liste"}${times}`;
    case "list_vote":
      return `a voté pour ${item.sampleTitle || "un titre"}${times}`;
    default:
      return `activité${times}`;
  }
}

/** "Cette semaine chez tes amis" — weekly rollup, fetched on mount only (slow-moving data). */
export function WeeklyDigest() {
  const [items, setItems] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getWeeklyDigest()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading && items.length === 0) {
    return (
      <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
        <p className="text-sm text-dim">Chargement du récap…</p>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="rounded-[14px] border border-lime/25 bg-lime/[0.04] p-4 sm:p-5">
      <SectionTitle
        icon={CalendarRange}
        title="Cette semaine chez tes amis"
        action={
          <button
            type="button"
            onClick={() => setReloadKey((n) => n + 1)}
            className="rounded-[8px] p-1.5 text-dim transition hover:bg-bg hover:text-lime"
            aria-label="Actualiser le récap"
          >
            <RotateCw className="size-3.5" />
          </button>
        }
      />
      <ul className="space-y-2">
        {items.slice(0, 8).map((item) => (
          <li
            key={`${item.actorId}-${item.kind}`}
            className="flex items-center gap-2.5 text-sm"
          >
            <ProfileAvatar name={item.actorName} src={item.actorAvatar} size="sm" />
            <p className="min-w-0 flex-1 truncate text-dim">
              <span className="font-semibold text-ink">{item.actorName}</span> {kindText(item)}
            </p>
            {item.sampleImage ? (
              <img
                src={item.sampleImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-9 w-7 shrink-0 rounded object-cover"
              />
            ) : null}
          </li>
        ))}
      </ul>
      <Link to="/friends" className="mt-3 inline-block text-xs font-semibold text-dim hover:text-lime">
        Tout voir dans l’activité →
      </Link>
    </section>
  );
}
