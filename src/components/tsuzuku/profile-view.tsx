import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Camera,
  Download,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { ImportView } from "@/components/tsuzuku/import-view";
import { ShareSettings } from "@/components/tsuzuku/share-settings";
import { RedirectToSignIn, writeAvatarCache } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAdminStatus } from "@/lib/admin";
import { authClient, signOut } from "@/lib/auth/client";
import {
  deleteMyAccount,
  getMyProfile,
  searchProfiles,
  updateMyProfile,
  type FavoriteAnime,
  type ProfileVisibility,
  type PublicProfile,
} from "@/lib/profile";
import { useWatchlistStore } from "@/store/watchlist-store";

export function ProfileView() {
  const { user, isPending } = useCurrentUserState();
  const flushSync = useWatchlistStore((s) => s.flushSync);
  const resetSession = useWatchlistStore((s) => s.resetSession);
  const entries = useWatchlistStore((s) => s.entries);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const exportJson = useWatchlistStore((s) => s.exportJson);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<ProfileVisibility>("public");
  const [showStats, setShowStats] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteAnime[]>([]);
  const [anilistUrl, setAnilistUrl] = useState("");
  const [malUrl, setMalUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    void getAdminStatus()
      .then((status) => setIsAdmin(status.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user?.id]);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");


  useEffect(() => {
    if (user?.id) hydrate(user.id);
  }, [user?.id, hydrate]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    void getMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName);
        setUsername(p.username);
        setBio(p.bio);
        setVisibility(p.visibility || (p.isPublic ? "public" : "private"));
        setShowStats(p.showStats !== false);
        setShowFavorites(p.showFavorites !== false);
        setFavorites(p.favorites || []);
        setAnilistUrl(p.anilistUrl || "");
        setMalUrl(p.malUrl || "");
        setAvatarUrl(p.avatarUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[profile] load failed", err);
        setError(msg || "Impossible de charger le profil");
        setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadToken]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      void searchProfiles({ data: { q } })
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  if (isPending) {
    return (
      <div className="flex justify-center py-20 text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  // Keep in sync with the server-side cap in lib/profile.ts.
  const AVATAR_DATA_URL_MAX_LENGTH = 60_000;

  const resizeImageToDataUrl = (file: File, maxSize: number, quality: number) =>
    new Promise<string>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = maxSize;
          canvas.height = maxSize;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas indisponible.");
          ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
          let dataUrl = canvas.toDataURL("image/webp", quality);
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Traitement de l'image impossible."));
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image illisible."));
      };
      img.src = objectUrl;
    });

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image (JPEG, PNG, WebP…).");
      return;
    }
    if (file.size > 8_000_000) {
      setError("Image trop lourde (max ~8 Mo).");
      return;
    }
    setError("");
    try {
      let dataUrl = await resizeImageToDataUrl(file, 256, 0.82);
      if (dataUrl.length > AVATAR_DATA_URL_MAX_LENGTH) {
        dataUrl = await resizeImageToDataUrl(file, 160, 0.7);
      }
      if (dataUrl.length > AVATAR_DATA_URL_MAX_LENGTH) {
        setError("Cette image compresse mal — essaie une photo plus simple.");
        return;
      }
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de traiter cette image.");
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const p = await updateMyProfile({
        data: {
          username,
          displayName,
          bio,
          avatarUrl,
          visibility,
          showStats,
          showFavorites,
          favorites,
          anilistUrl: anilistUrl.trim() || null,
          malUrl: malUrl.trim() || null,
        },
      });
      setProfile(p);
      if (user?.id) writeAvatarCache(user.id, p.avatarUrl, p.displayName);
      setOkMsg("Profil enregistré");
      setTimeout(() => setOkMsg(""), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwdMsg("");
    setPwdErr("");
    if (newPassword.length < 8) {
      setPwdErr("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr("La confirmation ne correspond pas.");
      return;
    }
    setPwdBusy(true);
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (res.error) {
        throw new Error(res.error.message || "Impossible de changer le mot de passe");
      }
      setPwdMsg("Mot de passe mis à jour.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : String(err));
    } finally {
      setPwdBusy(false);
    }
  };

  const removeAccount = async () => {
    setDeleting(true);
    setError("");
    try {
      await flushSync().catch(() => undefined);
      await deleteMyAccount({ data: { confirm: deleteConfirm } });
      resetSession();
      await signOut("/");
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {error && !loading ? (
          <div className="rounded-[12px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
            <p className="font-semibold text-red-300">Erreur de chargement</p>
            <p className="mt-1 text-dim">{error}</p>
            <button
              type="button"
              className="mt-2 text-sm font-bold text-lime underline-offset-2 hover:underline"
              onClick={() => {
                setError("");
                setReloadToken((n) => n + 1);
              }}
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {/* Search others */}
        <section className="rounded-[12px] border border-line bg-raised p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Search className="size-4 text-lime" />
            Rechercher un profil
          </h2>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Pseudo ou nom…"
            className="w-full rounded-[9px] border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-lime"
          />
          {searching ? (
            <p className="mt-2 text-xs text-dim">Recherche…</p>
          ) : searchResults.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {searchResults.map((r) => (
                <li key={r.userId}>
                  <Link
                    to="/u/$username"
                    params={{ username: r.username }}
                    className="flex items-center gap-3 rounded-[9px] px-2 py-2 hover:bg-bg"
                  >
                    <ProfileAvatar name={r.displayName} src={r.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.displayName}</div>
                      <div className="text-xs text-dim">@{r.username}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : searchQ.trim().length >= 2 ? (
            <p className="mt-2 text-xs text-dim">Aucun profil public trouvé.</p>
          ) : null}
        </section>

        {loading ? (
          <div className="flex justify-center py-16 text-dim">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Avatar + identity */}
            <section className="rounded-[12px] border border-line bg-raised p-5">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group relative"
                  aria-label="Changer la photo"
                >
                  <ProfileAvatar name={displayName || "?"} src={avatarUrl} size="xl" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="size-6 text-ink" />
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm text-dim">
                    {profile?.listCount ?? 0} titre{(profile?.listCount || 0) > 1 ? "s" : ""} dans
                    la liste
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-lime"
                    onClick={() => fileRef.current?.click()}
                  >
                    Changer la photo
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="ml-3 text-xs font-semibold text-dim underline-offset-2 hover:underline"
                      onClick={() => setAvatarUrl(null)}
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <Field label="Nom affiché">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={48}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-lime"
                  />
                </Field>
                <Field label="Pseudo (URL publique)">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-dim">@</span>
                    <input
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                      }
                      maxLength={24}
                      className="w-full rounded-[9px] border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-lime"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-dim">
                    3–24 caractères · a-z, 0-9, _ · visible sur /u/{username || "…"}
                  </p>
                </Field>
                <Field label="Bio">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={280}
                    placeholder="Quelques mots sur toi et ta watchlist…"
                    className="w-full resize-y rounded-[9px] border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-lime"
                  />
                </Field>
                <Field label="Visibilité du profil">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as ProfileVisibility)}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-lime"
                  >
                    <option value="public">Public — visible par tous</option>
                    <option value="friends">Amis seulement</option>
                    <option value="private">Privé — toi uniquement</option>
                  </select>
                </Field>
                <p className="text-[11.5px] text-dim">
                  Seuls les profils publics apparaissent dans la recherche.
                </p>
              </div>

              {profile?.stats ? (
                <details open className="mt-4 rounded-[10px] border border-line bg-bg/40 p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <span>Statistiques</span>
                    <label className="flex items-center gap-2 text-xs text-dim">
                      <input
                        type="checkbox"
                        checked={showStats}
                        onChange={(e) => setShowStats(e.target.checked)}
                      />
                      Afficher sur le profil
                    </label>
                  </summary>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.total}</div>
                      <div className="text-dim">Total</div>
                    </div>
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.watching}</div>
                      <div className="text-dim">En cours</div>
                    </div>
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.completed}</div>
                      <div className="text-dim">Terminés</div>
                    </div>
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.planToWatch}</div>
                      <div className="text-dim">À voir</div>
                    </div>
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.avgRating ?? "—"}</div>
                      <div className="text-dim">Note moy.</div>
                    </div>
                    <div className="rounded-lg bg-raised p-2">
                      <div className="font-bold">{profile.stats.episodesWatched}</div>
                      <div className="text-dim">Épisodes</div>
                    </div>
                  </div>
                </details>
              ) : null}

              <details open className="mt-3 rounded-[10px] border border-line bg-bg/40 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="size-4 text-lime" />
                    Top 5 favoris
                    <span className="text-[11px] font-medium text-dim">
                      ({favorites.length}/5)
                    </span>
                  </span>
                  <span
                    className="flex items-center gap-2 text-xs text-dim"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={showFavorites}
                      onChange={(e) => setShowFavorites(e.target.checked)}
                      id="show-favorites-toggle"
                    />
                    <label htmlFor="show-favorites-toggle">Afficher</label>
                  </span>
                </summary>
                <p className="mb-2 text-[11.5px] text-dim">
                  Choisis jusqu&apos;à 5 titres depuis ta watchlist, puis enregistre le profil.
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {favorites.length === 0 ? (
                    <span className="text-[12px] text-dim/80">Aucun favori pour l&apos;instant.</span>
                  ) : (
                    favorites.map((f, idx) => (
                      <span
                        key={f.anilistId}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-raised py-1 pr-1.5 pl-1 text-[11.5px]"
                      >
                        <span className="flex size-5 items-center justify-center rounded-full bg-lime/20 text-[10px] font-bold text-lime">
                          {idx + 1}
                        </span>
                        {f.image ? (
                          <img src={f.image} alt="" className="size-5 rounded object-cover" />
                        ) : null}
                        <span className="max-w-[140px] truncate">{f.title}</span>
                        <button
                          type="button"
                          className="text-dim hover:text-crimson"
                          aria-label={`Retirer ${f.title}`}
                          onClick={() =>
                            setFavorites((prev) => prev.filter((x) => x.anilistId !== f.anilistId))
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                {favorites.length < 5 ? (
                  <FavoritesPicker
                    entries={entries}
                    favorites={favorites}
                    onAdd={(entry) => {
                      setFavorites((prev) => {
                        if (prev.length >= 5) return prev;
                        if (prev.some((f) => f.anilistId === entry.anilistId)) return prev;
                        return [
                          ...prev,
                          {
                            anilistId: entry.anilistId,
                            title: entry.title,
                            image: entry.image,
                          },
                        ];
                      });
                    }}
                  />
                ) : (
                  <p className="text-[12px] text-dim">Maximum de 5 favoris atteint.</p>
                )}
              </details>

              <details open className="mt-3 rounded-[10px] border border-line bg-bg/40 p-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <ExternalLink className="size-4 text-lime" />
                  Liens externes
                </summary>
                <div className="mt-3 space-y-3">
                  <Field label="AniList">
                  <input
                    value={anilistUrl}
                    onChange={(e) => setAnilistUrl(e.target.value)}
                    placeholder="https://anilist.co/user/…"
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime"
                  />
                  </Field>
                  <Field label="MyAnimeList">
                  <input
                    value={malUrl}
                    onChange={(e) => setMalUrl(e.target.value)}
                    placeholder="https://myanimelist.net/profile/…"
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime"
                  />
                  </Field>
                </div>
              </details>

              {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
              {okMsg ? <p className="mt-3 text-sm text-lime">{okMsg}</p> : null}

              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[9px] bg-lime px-4 py-2.5 text-sm font-bold text-bg disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Enregistrer
              </button>

              {username ? (
                <Link
                  to="/u/$username"
                  params={{ username }}
                  className="mt-3 block text-center text-sm font-semibold text-dim underline-offset-2 hover:underline"
                >
                  Voir mon profil public
                </Link>
              ) : null}
            </section>

            <section className="rounded-[12px] border border-line bg-raised p-5">
              <h2 className="font-serif mb-1 flex items-center gap-2 text-base font-medium">
                <KeyRound className="size-4 text-lime" />
                Mot de passe
              </h2>
              <p className="mb-3 text-xs text-dim">
                Disponible si tu t&apos;es inscrit avec e-mail / mot de passe.
              </p>
              {pwdErr ? <p className="mb-2 text-sm text-red-400">{pwdErr}</p> : null}
              {pwdMsg ? <p className="mb-2 text-sm text-lime">{pwdMsg}</p> : null}
              <div className="space-y-3">
                <Field label="Mot de passe actuel">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none"
                  />
                </Field>
                <Field label="Nouveau mot de passe">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none"
                  />
                </Field>
                <Field label="Confirmer">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none"
                  />
                </Field>
                <button
                  type="button"
                  disabled={pwdBusy || !currentPassword || !newPassword}
                  onClick={() => void changePassword()}
                  className="rounded-[9px] border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {pwdBusy ? "Mise à jour…" : "Changer le mot de passe"}
                </button>
              </div>
            </section>

            <section className="rounded-[12px] border border-line bg-raised p-4">
              <Link
                to="/friends"
                className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 hover:bg-bg"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-lime" />
                  Gérer mes amis
                </span>
                <span className="text-xs text-dim">Demandes · liste</span>
              </Link>
            </section>

            {/* Danger zone */}
            <section className="rounded-[12px] border border-red-500/30 bg-red-500/5 p-5">
              <h2 className="font-serif text-base font-medium text-red-300">Zone dangereuse</h2>
              <p className="mt-1 text-sm text-dim">
                La suppression est définitive : watchlist, partages, profil et sessions.
              </p>
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-[9px] border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-300"
                >
                  <Trash2 className="size-4" />
                  Supprimer mon compte
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm">
                    Tape <strong className="text-ink">SUPPRIMER</strong> pour confirmer :
                  </p>
                  <input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-[9px] border border-line px-3 py-2 text-sm font-semibold"
                      onClick={() => {
                        setDeleteOpen(false);
                        setDeleteConfirm("");
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={deleting || deleteConfirm !== "SUPPRIMER"}
                      onClick={() => void removeAccount()}
                      className="flex-1 rounded-[9px] bg-red-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      {deleting ? "Suppression…" : "Confirmer"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <ImportView open={importOpen} onClose={() => setImportOpen(false)} />
      <ShareSettings open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );

}

function FavoritesPicker({
  entries,
  favorites,
  onAdd,
}: {
  entries: { id: string; anilistId: number; title: string; image: string | null }[];
  favorites: FavoriteAnime[];
  onAdd: (entry: { anilistId: number; title: string; image: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const favIds = new Set(favorites.map((f) => f.anilistId));
  const available = entries
    .filter((e) => !favIds.has(e.anilistId))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
  const filtered = (
    q.trim()
      ? available.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()))
      : available
  ).slice(0, 30);

  if (entries.length === 0) {
    return (
      <p className="rounded-[9px] border border-dashed border-line px-3 py-2.5 text-[12.5px] text-dim">
        Ta watchlist est vide ou pas encore chargée. Ajoute des titres, puis reviens ici.
      </p>
    );
  }

  if (available.length === 0) {
    return (
      <p className="text-[12px] text-dim">Tous les titres de ta liste sont déjà dans le top 5.</p>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-[9px] border border-line bg-bg px-3 py-2 focus-within:border-lime/50">
        <Search className="size-3.5 shrink-0 text-dim" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un titre à ajouter…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {q ? (
          <button type="button" onClick={() => setQ("")} aria-label="Effacer">
            <X className="size-3.5 text-dim" />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-[10px] border border-line bg-raised py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-dim">Aucun titre trouvé</li>
          ) : (
            filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-lime/10"
                  onClick={() => {
                    onAdd(e);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {e.image ? (
                    <img src={e.image} alt="" className="size-7 rounded object-cover" />
                  ) : (
                    <span className="size-7 rounded bg-bg" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}


function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-dim">{label}</span>
      {children}
    </label>
  );
}
