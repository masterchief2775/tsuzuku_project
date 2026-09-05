import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Loader2,
  Search,
  Ban,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  acceptFriendRequest,
  listFriendRequests,
  listFriends,
  rejectFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type FriendProfile,
  type FriendRequest,
} from "@/lib/friends";
import {
  blockUser,
  listBlockedUsers,
  unblockUser,
  type BlockedUser,
} from "@/lib/blocks";
import {
  fetchFriendActivity,
  markActivityRead,
  type ActivityItem,
} from "@/lib/activity-client";
import { searchProfiles, type PublicProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  component: FriendsPage,
});

function FriendsPage() {
  const { user, isPending } = useCurrentUserState();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState("");

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      const [f, req, bl, act] = await Promise.all([
        listFriends(),
        listFriendRequests(),
        listBlockedUsers().catch(() => [] as BlockedUser[]),
        fetchFriendActivity(15),
      ]);
      setFriends(f);
      setIncoming(req.incoming);
      setOutgoing(req.outgoing);
      setBlocked(bl);
      setActivity(act);
      if (act.some((a) => !a.readAt)) void markActivityRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    void reload();
    const id = window.setInterval(() => void reload(), 45_000);
    return () => window.clearInterval(id);
  }, [user?.id, reload]);

  useEffect(() => {
    if (searchQ.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchProfiles({ data: { q: searchQ.trim() } })
        .then((rows) => {
          if (!cancelled) setSearchResults(rows);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchQ]);

  async function run(id: string, fn: () => Promise<unknown>, success?: string) {
    setBusyId(id);
    setError("");
    setOkMsg("");
    try {
      await fn();
      if (success) setOkMsg(success);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            to="/profile"
            className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
            aria-label="Profil"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1">
            <div className="font-serif text-lg font-semibold">Amis</div>
            <div className="text-xs text-dim">
              {friends.length} ami{friends.length !== 1 ? "s" : ""}
              {incoming.length > 0 ? ` · ${incoming.length} demande${incoming.length > 1 ? "s" : ""}` : ""}
            </div>
          </div>
          <Users className="size-5 text-dim" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-7">
        {error ? (
          <p className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="rounded-[10px] border border-lime/30 bg-lime/10 px-3 py-2 text-sm text-lime">
            {okMsg}
          </p>
        ) : null}

        {/* Search & add */}
        <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
          <h2 className="font-serif text-base font-medium">Ajouter un ami</h2>
          <p className="mt-1 text-xs text-dim">
            Cherche un pseudo Tsuzuku et envoie une demande.
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-dim" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Pseudo ou nom…"
              className="w-full rounded-[10px] border border-line bg-bg py-2.5 pr-3 pl-10 text-sm outline-none focus:border-lime/50"
            />
          </div>
          {searching ? <p className="mt-2 text-xs text-dim">Recherche…</p> : null}
          {searchResults.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {searchResults
                .filter((p) => p.userId !== user.id)
                .map((p) => {
                  const alreadyFriend = friends.some((f) => f.userId === p.userId);
                  const pendingOut = outgoing.some((r) => r.other.userId === p.userId);
                  const pendingIn = incoming.some((r) => r.other.userId === p.userId);
                  return (
                    <li
                      key={p.userId}
                      className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3 py-2"
                    >
                      <Link to="/u/$username" params={{ username: p.username }} className="shrink-0">
                        <ProfileAvatar name={p.displayName} src={p.avatarUrl} size="sm" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/u/$username"
                          params={{ username: p.username }}
                          className="block truncate text-sm font-semibold hover:text-lime"
                        >
                          {p.displayName}
                        </Link>
                        <div className="text-xs text-dim">@{p.username}</div>
                      </div>
                      {alreadyFriend ? (
                        <span className="text-xs font-semibold text-lime">Ami</span>
                      ) : pendingOut ? (
                        <span className="text-xs text-dim">Demande envoyée</span>
                      ) : pendingIn ? (
                        <span className="text-xs text-dim">Te l’a demandée</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === p.userId}
                          onClick={() =>
                            void run(
                              p.userId,
                              () => sendFriendRequest({ data: { userId: p.userId } }),
                              "Demande envoyée",
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] border border-lime/40 bg-lime/10 px-2.5 py-1.5 text-xs font-semibold text-lime disabled:opacity-50"
                        >
                          <UserPlus className="size-3.5" />
                          Ajouter
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          ) : null}
        </section>

        {/* Incoming */}
        {incoming.length > 0 ? (
          <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
            <h2 className="font-serif text-base font-medium">
              Demandes reçues ({incoming.length})
            </h2>
            <ul className="mt-3 space-y-2">
              {incoming.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3 py-2.5"
                >
                  <Link
                    to="/u/$username"
                    params={{ username: r.other.username }}
                    className="shrink-0"
                  >
                    <ProfileAvatar name={r.other.displayName} src={r.other.avatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.other.displayName}</div>
                    <div className="text-xs text-dim">@{r.other.username}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void run(r.id, () => acceptFriendRequest({ data: { requestId: r.id } }), "Ami ajouté")
                    }
                    className="inline-flex items-center gap-1 rounded-[8px] bg-lime px-2.5 py-1.5 text-xs font-bold text-bg disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                    Accepter
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void run(r.id, () => rejectFriendRequest({ data: { requestId: r.id } }), "Demande refusée")
                    }
                    className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                    Refuser
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Outgoing */}
        {outgoing.length > 0 ? (
          <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
            <h2 className="font-serif text-base font-medium">
              Demandes envoyées ({outgoing.length})
            </h2>
            <ul className="mt-3 space-y-2">
              {outgoing.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3 py-2.5"
                >
                  <Link
                    to="/u/$username"
                    params={{ username: r.other.username }}
                    className="shrink-0"
                  >
                    <ProfileAvatar name={r.other.displayName} src={r.other.avatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.other.displayName}</div>
                    <div className="text-xs text-dim">En attente</div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() =>
                      void run(
                        r.id,
                        () => removeFriendship({ data: { requestId: r.id } }),
                        "Demande annulée",
                      )
                    }
                    className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}


        <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
          <h2 className="font-serif text-base font-medium">Activité récente</h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-dim">
              Quand un ami termine un titre, le note, ou t’envoie une demande, ça apparaît ici.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2.5 rounded-[10px] border border-line bg-bg px-3 py-2 text-sm"
                >
                  <ProfileAvatar name={a.actorName} src={a.actorAvatar} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-dim">
                      <Link
                        to="/u/$username"
                        params={{ username: a.actorUsername }}
                        className="font-semibold text-ink hover:text-lime"
                      >
                        {a.actorName}
                      </Link>{" "}
                      {a.kind === "completed" && (
                        <>
                          a terminé <span className="font-semibold text-ink">{a.title}</span>
                        </>
                      )}
                      {a.kind === "rated" && (
                        <>
                          a noté <span className="font-semibold text-ink">{a.title}</span>
                          {a.rating != null ? ` · ${a.rating}/10` : ""}
                        </>
                      )}
                      {a.kind === "friend_request" && <>t’a envoyé une demande d’ami</>}
                      {a.kind === "friend_accept" && <>a accepté ta demande d’ami</>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-dim">
                      {new Date(a.createdAt).toLocaleString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {a.image ? (
                    <img src={a.image} alt="" className="h-11 w-8 rounded object-cover" />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Friend list */}
        <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
          <h2 className="font-serif text-base font-medium">Ma liste d’amis</h2>
          {loading ? (
            <div className="flex justify-center py-10 text-dim">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <p className="mt-3 text-sm text-dim">
              Aucun ami pour l’instant. Cherche un pseudo ci-dessus pour envoyer une demande.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {friends.map((f) => (
                <li
                  key={f.userId}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3 py-2.5"
                >
                  <Link to="/u/$username" params={{ username: f.username }} className="shrink-0">
                    <ProfileAvatar name={f.displayName} src={f.avatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/u/$username"
                      params={{ username: f.username }}
                      className="block truncate text-sm font-semibold hover:text-lime"
                    >
                      {f.displayName}
                    </Link>
                    <div className="text-xs text-dim">@{f.username}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === f.userId}
                    onClick={() => {
                      if (!window.confirm(`Retirer ${f.displayName} de tes amis ?`)) return;
                      void run(
                        f.userId,
                        () => removeFriendship({ data: { userId: f.userId } }),
                        "Ami retiré",
                      );
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-crimson/40 hover:text-crimson disabled:opacity-50",
                    )}
                  >
                    <UserMinus className="size-3.5" />
                    Retirer
                  </button>
                  <button
                    type="button"
                    disabled={busyId === f.userId}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Bloquer ${f.displayName} ? Amis retirés, plus de demandes possibles.`,
                        )
                      )
                        return;
                      void run(
                        f.userId,
                        () => blockUser({ data: { userId: f.userId } }),
                        "Utilisateur bloqué",
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-crimson/40 hover:text-crimson disabled:opacity-50"
                  >
                    <Ban className="size-3.5" />
                    Bloquer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] border border-line bg-raised p-4 sm:p-5">
          <h2 className="font-serif flex items-center gap-2 text-base font-medium">
            <Ban className="size-4 text-dim" />
            Utilisateurs bloqués
          </h2>
          {blocked.length === 0 ? (
            <p className="mt-3 text-sm text-dim">Personne n’est bloqué pour le moment.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {blocked.map((b) => (
                <li
                  key={b.userId}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-3 py-2.5"
                >
                  <ProfileAvatar name={b.displayName} src={b.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.displayName}</div>
                    <div className="text-xs text-dim">@{b.username}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === b.userId}
                    onClick={() =>
                      void run(
                        b.userId,
                        () => unblockUser({ data: { userId: b.userId } }),
                        "Utilisateur débloqué",
                      )
                    }
                    className="rounded-[8px] border border-lime/40 bg-lime/10 px-2.5 py-1.5 text-xs font-semibold text-lime disabled:opacity-50"
                  >
                    Débloquer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

