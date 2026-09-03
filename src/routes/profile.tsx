import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Camera, Loader2, Save, Search, Trash2 } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import {
  deleteMyAccount,
  getMyProfile,
  searchProfiles,
  updateMyProfile,
  type PublicProfile,
} from "@/lib/profile";
import { useWatchlistStore } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  component: MyProfilePage,
});

function MyProfilePage() {
  const { user, isPending } = useCurrentUserState();
  const flushSync = useWatchlistStore((s) => s.flushSync);
  const resetSession = useWatchlistStore((s) => s.resetSession);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = await getMyProfile();
      setProfile(p);
      setDisplayName(p.displayName);
      setUsername(p.username);
      setBio(p.bio);
      setIsPublic(p.isPublic);
      setAvatarUrl(p.avatarUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

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
      <div className="flex min-h-dvh items-center justify-center bg-bg text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const onPickAvatar = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image (JPEG, PNG, WebP…).");
      return;
    }
    if (file.size > 400_000) {
      setError("Image trop lourde (max ~400 Ko). Compresse-la un peu.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      setAvatarUrl(result);
    };
    reader.readAsDataURL(file);
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
          isPublic,
        },
      });
      setProfile(p);
      setOkMsg("Profil enregistré");
      setTimeout(() => setOkMsg(""), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            to="/"
            className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
            aria-label="Retour"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-lg font-semibold">Mon profil</h1>
            <p className="truncate text-xs text-dim">@{username || "…"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-6 sm:px-7">
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
                  onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
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
                <label className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-bg/40 px-4 py-3">
                  <span className="text-sm font-semibold">Profil public</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    onClick={() => setIsPublic((v) => !v)}
                    className={cn(
                      "relative h-7 w-12 rounded-full transition-colors",
                      isPublic ? "bg-lime" : "bg-line",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 size-6 rounded-full bg-bg transition-transform",
                        isPublic && "translate-x-5",
                      )}
                    />
                  </button>
                </label>
                <p className="text-[11.5px] text-dim">
                  Un profil privé n’apparaît pas dans la recherche et n’est pas consultable via
                  le lien.
                </p>
              </div>

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
      </main>
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
