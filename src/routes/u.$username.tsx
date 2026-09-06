import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  Star,
  ShieldCheck,
  Upload,
  Ban,
  Camera,
  Save,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { AppFooter } from "@/components/tsuzuku/app-footer";
import { AppPrimaryNav } from "@/components/tsuzuku/app-primary-nav";
import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { ImportView } from "@/components/tsuzuku/import-view";
import { ShareSettings } from "@/components/tsuzuku/share-settings";
import { ThemePicker } from "@/components/tsuzuku/theme-picker";
import { AppToast } from "@/components/tsuzuku/toast";
import { getAdminStatus } from "@/lib/admin";
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
  updateMyProfile,
  type PublicProfile,
} from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useWatchlistStore } from "@/store/watchlist-store";
import { UserButton, writeAvatarCache } from "@/lib/auth/gates";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfilePage,
});

function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas indisponible."));
        return;
      }
      context.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        160,
        160,
      );
      const dataUrl = canvas.toDataURL("image/webp", 0.7);
      URL.revokeObjectURL(objectUrl);
      if (dataUrl.length > 60_000) reject(new Error("Image trop lourde après compression."));
      else resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image illisible."));
    };
    image.src = objectUrl;
  });
}

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useCurrentUserState();
  const exportJson = useWatchlistStore((s) => s.exportJson);
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
    function profilePresenceLabel(profile: PublicProfile): string {
      if (profile.isOnline) return "En ligne";
      if (!profile.lastSeen) return "Hors ligne";
      const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(profile.lastSeen)) / 60_000);
      if (minutes < 1) return "Vu à l’instant";
      if (minutes < 60) return `Vu il y a ${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Vu il y a ${hours} h`;
      return `Vu il y a ${Math.floor(hours / 24)} j`;
    }
  const [error, setError] = useState("");
  const [relStatus, setRelStatus] = useState<FriendshipStatus>("none");
  const [requestId, setRequestId] = useState<string | undefined>();
  const [otherUserId, setOtherUserId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bioFieldRef = useRef<HTMLTextAreaElement>(null);

  // Grow the bio field to fit its content instead of showing a fixed, often
  // half-empty box — it should look like the paragraph it replaces, not a
  // generic multi-line form textarea.
  useEffect(() => {
    const el = bioFieldRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editBio]);

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    void getAdminStatus()
      .then((status) => setIsAdmin(status.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user?.id]);

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
        if (p && user?.id === p.userId) {
          setEditName(p.displayName);
          setEditBio(p.bio);
          setEditAvatar(p.avatarUrl);
        }
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

  async function saveBasicProfile() {
    if (!profile || !user || editSaving) return;
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await updateMyProfile({
        data: {
          username: profile.username,
          displayName: editName,
          bio: editBio,
          avatarUrl: editAvatar,
        },
      });
      setProfile((current) => current ? { ...current, ...updated } : updated);
      writeAvatarCache(user.id, updated.avatarUrl, updated.displayName);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Impossible d’enregistrer le profil.");
    } finally {
      setEditSaving(false);
    }
  }

  async function pickBasicAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEditError("Choisis une image.");
      return;
    }
    try {
      setEditAvatar(await resizeAvatar(file));
      setEditError("");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Impossible de traiter cette image.");
    }
  }

  const isSelf = Boolean(user && profile && user.id === profile.userId);
  const hasBasicChanges = Boolean(
    isSelf && profile &&
      (editName !== profile.displayName || editBio !== profile.bio || editAvatar !== profile.avatarUrl),
  );

  return (
    <div className="ambient-bg flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:px-7 sm:py-4">
        <div className="flex w-full items-center gap-3">
          <Link to="/" className="flex items-center gap-3" aria-label="Accueil">
            <BrandMark />
            <div className="hidden min-[400px]:block">
              <div className="font-serif text-xl font-semibold tracking-tight">Tsuzuku</div>
              <div className="text-xs text-dim">ta watchlist, en continu</div>
            </div>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-lg font-semibold">Profil</div>
            <div className="truncate text-xs text-dim">@{username}</div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemePicker />
            <UserButton />
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Partager la liste"
              title="Liste publique"
            >
              <Link2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Importer une liste MAL ou AniList"
              title="Importer MAL / AniList"
            >
              <Upload className="size-4" />
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="hidden rounded-sm border border-line bg-raised p-2 sm:inline-flex"
              aria-label="Exporter la watchlist en JSON"
              title="Exporter JSON"
            >
              <Download className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">
            <AppPrimaryNav />
          </div>
          {isAdmin ? (
            <Link
              to="/admin"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-lime/30 bg-lime/10 px-2.5 py-2 text-xs font-semibold text-lime transition hover:bg-lime/20"
              title="Administration"
              aria-label="Administration"
            >
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10 sm:px-7">
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
            <div className="public-profile-card rounded-[14px] border border-line bg-raised p-6 text-center sm:p-8">
              <div className="flex justify-center">
                {isSelf ? (
                  <>
                    <button type="button" className="profile-inline-edit-avatar" onClick={() => avatarInputRef.current?.click()} aria-label="Changer la photo publique">
                      <ProfileAvatar name={editName || profile.displayName} src={editAvatar} size="xl" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void pickBasicAvatar(event.target.files?.[0])}
                    />
                  </>
                ) : (
                  <ProfileAvatar name={profile.displayName} src={profile.avatarUrl} size="xl" />
                )}
              </div>
              {isSelf ? (
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="profile-inline-field font-serif mx-auto mt-4 max-w-sm text-center text-2xl font-semibold"
                  placeholder="Nom affiché"
                  maxLength={48}
                />
              ) : (
                <h1 className="font-serif mt-4 text-2xl font-semibold">{profile.displayName}</h1>
              )}
              <p className="text-sm text-dim">@{profile.username}</p>
              <p className={cn("mt-2 text-xs font-semibold", profile.isOnline ? "text-emerald-400" : "text-dim")}>
                <span className={cn("mr-1.5 inline-block size-2 rounded-full", profile.isOnline ? "bg-emerald-400" : "bg-dim/70")} />
                {profilePresenceLabel(profile)}
              </p>
              {profile.bio || isSelf ? (
                isSelf ? (
                  <textarea
                    ref={bioFieldRef}
                    value={editBio}
                    onChange={(event) => setEditBio(event.target.value)}
                    className="profile-inline-field mx-auto mt-4 max-w-md resize-none text-left text-sm leading-relaxed text-dim"
                    placeholder="Ajouter une bio…"
                    maxLength={280}
                    rows={1}
                  />
                ) : (
                  <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">{profile.bio}</p>
                )
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
                  <>
                    <Link
                      to="/profile"
                      className="rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim"
                    >
                      Paramètres avancés
                    </Link>
                  </>
                ) : null}

                {!isSelf && user ? (
                  <>
                    <Link
                      to="/messages"
                      className="inline-flex items-center gap-2 rounded-[9px] border border-line px-4 py-2 text-sm font-semibold text-dim hover:border-lime/40 hover:text-ink"
                    >
                      <MessageCircle className="size-4" />
                      Message
                    </Link>
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
                          () =>
                            unblockUser({ data: { userId: profile.userId } }).then(() => {
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
      {hasBasicChanges ? (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-raised px-3 py-2 text-xs font-semibold text-ink shadow-2xl">
          <span className="hidden text-dim sm:inline">Modifications non enregistrées</span>
          <button
            type="button"
            disabled={editSaving}
            onClick={() => void saveBasicProfile()}
            className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 font-bold text-bg disabled:opacity-60"
          >
            <Save className="size-3.5" />
            {editSaving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      ) : null}
      <AppFooter publicPage />
      <ImportView open={importOpen} onClose={() => setImportOpen(false)} />
      <ShareSettings open={shareOpen} onClose={() => setShareOpen(false)} />
      <AppToast />
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
