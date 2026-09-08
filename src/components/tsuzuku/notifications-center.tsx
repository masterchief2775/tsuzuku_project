import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import {
  fetchActivityBadge,
  fetchFriendActivity,
  markActivityRead,
  type ActivityItem,
} from "@/lib/activity-client";
import { useUnreadMessageCount } from "@/components/tsuzuku/messages-view";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
          {item.rating != null ? ` ★ ${item.rating}` : ""}
        </>
      );
    case "friend_request":
      return <>t’a envoyé une demande d’ami</>;
    case "friend_accept":
      return <>a accepté ta demande d’ami</>;
    case "list_add":
      return (
        <>
          a ajouté <span className="font-semibold text-ink">{item.title}</span> à une liste partagée
        </>
      );
    case "list_join":
      return (
        <>
          a rejoint la liste{" "}
          <span className="font-semibold text-ink">{item.title || "partagée"}</span>
        </>
      );
    case "list_vote":
      return (
        <>
          a voté pour <span className="font-semibold text-ink">{item.title}</span>
        </>
      );
    default:
      return null;
  }
}

export function NotificationsCenter() {
  const { user } = useCurrentUserState();
  const unreadMessages = useUnreadMessageCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const badgeCount = unreadActivity + pendingFriends + unreadMessages;

  const reloadBadge = useCallback(async () => {
    if (!user?.id) return;
    try {
      const b = await fetchActivityBadge();
      setUnreadActivity(b.unreadActivity);
      setPendingFriends(b.pendingFriendRequests);
    } catch {
      /* */
    }
  }, [user?.id]);

  const reloadList = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const list = await fetchFriendActivity(25);
      setItems(list);
      await reloadBadge();
    } finally {
      setLoading(false);
    }
  }, [user?.id, reloadBadge]);

  useEffect(() => {
    if (!user?.id) return;
    void reloadBadge();
    const id = window.setInterval(() => void reloadBadge(), 30_000);
    return () => window.clearInterval(id);
  }, [user?.id, reloadBadge]);

  useEffect(() => {
    if (open) void reloadList();
  }, [open, reloadList]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!panelRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function onMarkAllRead() {
    await markActivityRead();
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
    setUnreadActivity(0);
  }

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative rounded-sm border border-line bg-raised p-2 text-dim hover:text-ink",
          open && "border-lime/40 text-lime",
        )}
        aria-label={
          badgeCount > 0
            ? `Notifications, ${badgeCount} non lues`
            : "Notifications"
        }
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {badgeCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-extrabold text-bg">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-[min(100vw-2rem,360px)] overflow-hidden rounded-[14px] border border-line bg-raised shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              disabled={unreadActivity === 0}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-dim hover:text-lime disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" />
              Tout lu
            </button>
          </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {/* Quick links */}
            {pendingFriends > 0 ? (
              <Link
                to="/friends"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-b border-line/60 bg-lime/5 px-3.5 py-2.5 hover:bg-lime/10"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-lime/20 text-lime">
                  <UserPlus className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {pendingFriends} demande{pendingFriends > 1 ? "s" : ""} d’ami
                  </div>
                  <div className="text-[11.5px] text-dim">Voir dans Amis</div>
                </div>
              </Link>
            ) : null}

            {unreadMessages > 0 ? (
              <Link
                to="/messages"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-b border-line/60 bg-lime/5 px-3.5 py-2.5 hover:bg-lime/10"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-lime/20 text-lime">
                  <MessageCircle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {unreadMessages} message{unreadMessages > 1 ? "s" : ""} non lu
                    {unreadMessages > 1 ? "s" : ""}
                  </div>
                  <div className="text-[11.5px] text-dim">Ouvrir la messagerie</div>
                </div>
              </Link>
            ) : null}

            {loading && items.length === 0 ? (
              <div className="flex justify-center py-8 text-dim">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : items.length === 0 && pendingFriends === 0 && unreadMessages === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-dim">
                Rien de nouveau pour le moment.
              </p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex gap-2.5 border-b border-line/40 px-3.5 py-2.5 last:border-0",
                      !item.readAt && "bg-lime/[0.06]",
                    )}
                  >
                    <Link
                      to="/u/$username"
                      params={{ username: item.actorUsername }}
                      onClick={() => setOpen(false)}
                      className="shrink-0"
                    >
                      <ProfileAvatar name={item.actorName} src={item.actorAvatar} size="sm" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-dim">
                        <Link
                          to="/u/$username"
                          params={{ username: item.actorUsername }}
                          onClick={() => setOpen(false)}
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
          </div>

          <div className="border-t border-line px-3.5 py-2">
            <Link
              to="/friends"
              onClick={() => setOpen(false)}
              className="text-[12px] font-semibold text-dim hover:text-lime"
            >
              Voir l’activité amis →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
