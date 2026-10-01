import { useEffect, useState } from "react";
import { writeAvatarCache } from "@/lib/auth/gates";
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

// Keep in sync with the server-side cap in lib/profile.ts.
const AVATAR_DATA_URL_MAX_LENGTH = 60_000;

function resizeImageToDataUrl(file: File, maxSize: number, quality: number) {
  return new Promise<string>((resolve, reject) => {
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
}

/**
 * State + data layer for the profile page (extracted from ProfileView).
 * Loading, form fields, avatar processing, save/password/delete actions live
 * here; layout and JSX stay in the component.
 */
export function useProfileEditor(userId: string | undefined) {
  const flushSync = useWatchlistStore((s) => s.flushSync);
  const resetSession = useWatchlistStore((s) => s.resetSession);
  const hydrate = useWatchlistStore((s) => s.hydrate);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
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
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  useEffect(() => {
    if (userId) hydrate(userId);
  }, [userId, hydrate]);

  useEffect(() => {
    if (!userId) return;

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
  }, [userId, reloadToken]);

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

  const retry = () => {
    setError("");
    setReloadToken((n) => n + 1);
  };

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
      if (userId) writeAvatarCache(userId, p.avatarUrl, p.displayName);
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

  return {
    profile,
    loading,
    saving,
    error,
    setError,
    okMsg,
    displayName,
    setDisplayName,
    username,
    setUsername,
    bio,
    setBio,
    visibility,
    setVisibility,
    showStats,
    setShowStats,
    showFavorites,
    setShowFavorites,
    favorites,
    setFavorites,
    anilistUrl,
    setAnilistUrl,
    malUrl,
    setMalUrl,
    avatarUrl,
    setAvatarUrl,
    searchQ,
    setSearchQ,
    searchResults,
    searching,
    deleteOpen,
    setDeleteOpen,
    deleteConfirm,
    setDeleteConfirm,
    deleting,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    pwdBusy,
    pwdMsg,
    pwdErr,
    retry,
    onPickAvatar,
    save,
    changePassword,
    removeAccount,
  };
}
