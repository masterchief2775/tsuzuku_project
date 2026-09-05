import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  fetchFriendActivity,
  markActivityRead,
  type ActivityItem,
} from "@/lib/activity-client";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "à l’instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function labelFor(item: ActivityItem) {
  switch (item.kind) {
    case "completed":
      return (
        <>
          a terminé <span className="font-semibold text-ink">{item.title}</span>
        </>
      );
    case "rated":
      return (
        <>
          a noté <span className="font-semibold text-ink">{item.title}</span>
          {item.rating != null ? (
            <span className="text-lime"> · {item.rating}/10</span>
          ) : null}
        </>
      );
    case "friend_request":
      return <>t’a envoyé une demande d’ami</>;
    case "friend_accept":
      return <>a accepté ta demande d’ami</>;
    default:
      return null;
  }
}

/** Dashboard-only activity strip. Uses plain fetch to /api/activity (no createServerFn). */
export function ActivityFeed({ compact = true }: { compact?: boolean }) {
  const { user } = useCurrentUserState();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await fetchFriendActivity(compact ? 8 : 15);
      setItems(list);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [user?.id, compact]);

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      return;
    }
    setLoading(true);
    void reload();
  }, [user?.id, reload]);

  useEffect(() => {
    if (!user?.id || items.length === 0) return;
    if (!items.some((i) => !i.readAt)) return;
    const t = window.setTimeout(() => {
      void markActivityRead().then(() =>
        setItems((prev) =>
          prev.map((i) =>
            i.readAt ? i : { ...i, readAt: new Date().toISOString() },
          ),
        ),
      );
    }, 2500);
    return () => window.clearTimeout(t);
  }, [user?.id, items]);

  if (!user) return null;

  return (
    <section
      className={cn(
        "rounded-[14px] border border-line bg-raised",
        compact ? "p-3.5" : "p-4 sm:p-5",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-serif flex items-center gap-2 text-base font-medium">
          <Bell className="size-4 text-lime" />
          Activité récente
        </h2>
        <Link to="/friends" className="text-xs font-semibold text-dim hover:text-lime">
          Voir tout
        </Link>
      </div>
      {loading && items.length === 0 ? (
        <p className="text-sm text-dim">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-dim">
          Rien pour l’instant. Les actions de tes amis apparaîtront ici.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex gap-2.5 rounded-[10px] border border-transparent px-1.5 py-2",
                !item.readAt && "border-lime/20 bg-lime/5",
              )}
            >
              <Link
                to="/u/$username"
                params={{ username: item.actorUsername }}
                className="shrink-0"
              >
                <ProfileAvatar name={item.actorName} src={item.actorAvatar} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-dim">
                  <Link
                    to="/u/$username"
                    params={{ username: item.actorUsername }}
                    className="font-semibold text-ink hover:text-lime"
                  >
                    {item.actorName}
                  </Link>{" "}
                  {labelFor(item)}
                </p>
                <p className="mt-0.5 text-[11px] text-dim">{formatWhen(item.createdAt)}</p>
              </div>
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="h-11 w-8 shrink-0 rounded object-cover"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
