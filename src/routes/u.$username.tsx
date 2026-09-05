import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  Loader2,
  Star,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  acceptFriendRequest,
  getFriendshipWith,
  rejectFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type FriendshipStatus,
} from "@/lib/friends";
import { blockUser, getBlockStatus, unblockUser } from "@/lib/blocks";
import {
  getProfileByUsername,
  getProfileByUsernameAuthed,
  type PublicProfile,
} from "@/lib/profile";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useCurrentUserState();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [relStatus, setRelStatus] = useState<FriendshipStatus>("none");
  const [requestId, setRequestId] = useState<string | undefined>();
  const [otherUserId, setOtherUserId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [iBlockedThem, setIBlockedThem] = useState(false);

  const loadRelation = useCallback(
    async (userId?: string) => {
      if (!user?.id) {
        setRelStatus("none");
        return;
      }
      try {
        const rel = await getFriendshipWith({
          data: userId ? { userId } : { username },
        });
        setRelStatus(rel.status);
        setRequestId(rel.requestId);
        setOtherUserId(rel.otherUserId);
        if (rel.otherUserId) {
          try {
            const b = await getBlockStatus({ data: { userId: rel.otherUserId } });
            setIBlockedThem(b.iBlockedThem);
          } catch {
            setIBlockedThem(false);
          }
        }
      } catch {
        setRelStatus("none");
      }
    },
    [user?.id, username],
  );

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    setError("");
    setActionMsg("");

    const load = user?.id
      ? getProfileByUsernameAuthed({ data: { username } })
      : getProfileByUsername({ data: { username } });

    void load
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) void loadRelation(p.userId);
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setProfile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [username, loadRelation, user?.id]);

  async function doAction(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setActionMsg("");
    setError("");
    try {
      await fn();
      setActionMsg(msg);
      await loadRelation(profile?.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const isSelf = Boolean(user && profile && user.id === profile.userId);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            to="/"
            className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
            aria-label="Accueil"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="font-serif text-lg font-semibold">Profil</div>
            <div className="text-xs text-dim">@{username}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-7">
        {profile === undefined ? (
          <div className="flex justify-center py-16 text-dim">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}

        {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
        {actionMsg ? <p className="text-center text-sm text-lime">{actionMsg}</p> : null}

        {profile === null && !error ? (
          <div className="py-16 text-center">
            <p className="font-serif text-xl font-medium">Profil introuvable</p>
            <p className="mt-2 text-sm text-dim">
              Ce pseudo n&apos;existe pas, ou le profil est privé / réservé aux amis.
            </p>
            <Link to="/profile" className="mt-4 inline-block text-sm font-semibold text-lime">
              Chercher un autre profil
            </Link>
          </div>
        ) : null}

        {profile ? (
          <>
            <div className="rounded-[14px] border border-line bg-raised p-6 text-center sm:p-8">
              <div className="flex justify-center">
                <ProfileAvatar name={profile.displayName} src={profile.avatarUrl} size="xl" />
              </div>
              <h1 className="font-serif mt-4 text-2xl font-semibold">{profile.displayName}</h1>
              <p className="text-sm text-dim">@{profile.username}</p>
              {profile.bio ? (
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">
                  {profile.bio}
                </p>
              ) : null}
              {typeof profile.listCount === "number" ? (
                <p className="mt-3 text-xs text-dim">
                  {profile.listCount} titre{profile.listCount !== 1 ? "s" : ""} dans la watchlist
                </p>
              ) : null}

              {(profile.anilistUrl || profile.malUrl) && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {profile.anilistUrl ? (
                    <a
                      href={profile.anilistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-dim hover:text-ink"
                    >
                      <ExternalLink className="size-3" />
                      AniList
                    </a>
                  ) : null}
                  {profile.malUrl ? (
                    <a
                      href={profile.malUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-dim hover:text-ink"
                    >
                      <ExternalLink className="size-3" />
                      MAL
                    </a>
                  ) : null}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {isSelf ? (
                  <Link
                    to="/profile"
                    className="rounded-[9px] border border-line px-4 py-2 text-sm font-semibold"
                  >
                    Modifier mon profil
                  </Link>
                ) : null}

                {!isSelf && user ? (
                  <>
                    {relStatus === "none" || relStatus === "rejected" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void doAction(
                            () =>
                              sendFriendRequest({
                                data: { userId: profile.userId },
                              }),
                            "Demande d’ami envoyée",
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-4 py-2 text-sm font-bold text-bg disabled:opacity-50"
                      >
                        <UserPlus className="size-4" />
                        Ajouter en ami
                      </button>
                    ) : null}

                    {relStatus === "pending_out" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void doAction(
                            () =>
                              removeFriendship({
                                data: requestId
                                  ? { requestId }
                                  : { userId: otherUserId || profile.userId },
                              }),
                            "Demande annulée",
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim disabled:opacity-50"
                      >
                        <X className="size-4" />
                        Annuler la demande
                      </button>
                    ) : null}

                    {relStatus === "pending_in" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void doAction(
                              () =>
                                acceptFriendRequest({
                                  data: { requestId: requestId! },
                                }),
                              "Vous êtes maintenant amis",
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-4 py-2 text-sm font-bold text-bg disabled:opacity-50"
                        >
                          <Check className="size-4" />
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void doAction(
                              () =>
                                rejectFriendRequest({
                                  data: { requestId: requestId! },
                                }),
                              "Demande refusée",
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim disabled:opacity-50"
                        >
                          <X className="size-4" />
                          Refuser
                        </button>
                      </>
                    ) : null}

                    {relStatus === "friends" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Retirer ${profile.displayName} de tes amis ?`))
                            return;
                          void doAction(
                            () =>
                              removeFriendship({
                                data: { userId: profile.userId },
                              }),
                            "Ami retiré",
                          );
                        }}
                        className="inline-flex items-center gap-2 rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim hover:border-crimson/40 hover:text-crimson disabled:opacity-50"
                      >
                        <UserMinus className="size-4" />
                        Retirer des amis
                      </button>
                    ) : null}
                  </>
                ) : null}

                {user && !isSelf ? (
                  iBlockedThem ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void doAction(
                          () => unblockUser({ data: { userId: profile.userId } }).then(() => {
                            setIBlockedThem(false);
                          }),
                          "Utilisateur débloqué",
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-[9px] border border-lime/40 bg-lime/10 px-4 py-2 text-sm font-semibold text-lime disabled:opacity-50"
                    >
                      Débloquer
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Bloquer ${profile.displayName} ? Il ne pourra plus t’envoyer de demande ni voir ton profil.`,
                          )
                        )
                          return;
                        void doAction(
                          () =>
                            blockUser({ data: { userId: profile.userId } }).then(() => {
                              setIBlockedThem(true);
                              setRelStatus("none");
                            }),
                          "Utilisateur bloqué",
                        );
                      }}
                      className="inline-flex items-center gap-2 rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim hover:border-crimson/40 hover:text-crimson disabled:opacity-50"
                    >
                      <Ban className="size-4" />
                      Bloquer
                    </button>
                  )
                ) : null}

                {!user && !isSelf ? (
                  <Link
                    to="/login"
                    className="rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim"
                  >
                    Connecte-toi pour ajouter en ami
                  </Link>
                ) : null}
              </div>

              {relStatus === "friends" ? (
                <p className="mt-4 text-xs font-semibold text-lime">Vous êtes amis</p>
              ) : null}
            </div>

            {profile.showStats && profile.stats ? (
              <section className="rounded-[14px] border border-line bg-raised p-5">
                <h2 className="font-serif mb-3 text-base font-medium">Statistiques</h2>
                <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                  <Stat label="Total" value={profile.stats.total} />
                  <Stat label="En cours" value={profile.stats.watching} />
                  <Stat label="Terminés" value={profile.stats.completed} />
                  <Stat label="À voir" value={profile.stats.planToWatch} />
                  <Stat label="Note moy." value={profile.stats.avgRating ?? "—"} />
                  <Stat label="Épisodes" value={profile.stats.episodesWatched} />
                </div>
              </section>
            ) : null}

            {profile.showFavorites && profile.favorites.length > 0 ? (
              <section className="rounded-[14px] border border-line bg-raised p-5">
                <h2 className="font-serif mb-3 inline-flex items-center gap-2 text-base font-medium">
                  <Star className="size-4 text-lime" />
                  Favoris
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {profile.favorites.map((f) => (
                    <li key={f.anilistId} className="text-center">
                      <div className="mx-auto aspect-[2/3] w-full max-w-[100px] overflow-hidden rounded-[10px] border border-line bg-bg">
                        {f.image ? (
                          <img
                            src={f.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold leading-snug">
                        {f.title}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-line bg-bg p-2.5">
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="text-dim">{label}</div>
    </div>
  );
}
