import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  Dices,
  Heart,
  Link2,
  ListPlus,
  Loader2,
  Pencil,
  Play,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listFriends, type FriendProfile } from "@/lib/friends";
import {
  addSharedListItem,
  addSharedListItemsBulk,
  addSharedListMember,
  createSharedList,
  deleteSharedList,
  disableSharedListInvite,
  enableSharedListInvite,
  fetchMySharedLists,
  fetchSharedList,
  joinSharedListByToken,
  removeSharedListItem,
  removeSharedListMember,
  renameSharedList,
  setSharedListItemStatus,
  toggleSharedListVote,
  type SharedItemStatus,
  type SharedListDetail,
  type SharedListItem,
  type SharedListSummary,
} from "@/lib/shared-lists-client";
import {
  mediaTitle,
  searchAniListQuery,
  SEARCH_DEBOUNCE_MS,
  type AniListMedia,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  planned: "À voir",
  watching: "En cours",
  watched: "Vu",
  skipped: "Skip",
};

const STATUS_ORDER: SharedItemStatus[] = ["planned", "watching", "watched", "skipped"];

export function ListsView() {
  const id = useRouterState({
    select: (s) => {
      const raw = (s.location.search as { id?: string; join?: string }).id;
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    },
  });
  const joinToken = useRouterState({
    select: (s) => {
      const raw = (s.location.search as { join?: string }).join;
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    },
  });

  if (joinToken && !id) return <JoinByInvite token={joinToken} />;
  if (id) return <ListDetail listId={id} />;
  return <ListsIndex />;
}

function JoinByInvite({ token }: { token: string }) {
  const { user, loading: authLoading } = useCurrentUserState();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || busy) return;
    setBusy(true);
    void joinSharedListByToken(token)
      .then((res) => {
        void navigate({ to: "/lists", search: { id: res.listId } });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invitation invalide");
        setBusy(false);
      });
  }, [user?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || (user && !error && busy)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-dim">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Rejoindre la liste…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-dim">Connecte-toi pour rejoindre cette liste partagée.</p>
        <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-lime">
          Connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm text-crimson">{error || "Impossible de rejoindre"}</p>
      <button
        type="button"
        onClick={() => void navigate({ to: "/lists", search: {} })}
        className="mt-4 text-sm font-semibold text-lime"
      >
        Retour aux listes
      </button>
    </div>
  );
}

function ListsIndex() {
  const { user, loading: authLoading } = useCurrentUserState();
  const navigate = useNavigate();
  const [lists, setLists] = useState<SharedListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLists(await fetchMySharedLists());
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLists([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload();
    const t = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(t);
  }, [user?.id, reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await createSharedList(name.trim());
      setName("");
      await reload();
      if (res?.id) void navigate({ to: "/lists", search: { id: res.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex justify-center py-20 text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-dim">Connecte-toi pour gérer des listes partagées.</p>
        <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-lime">
          Connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] animate-fade-up">
      <div className="mb-6">
        <h1 className="font-serif text-xl font-medium">Listes partagées</h1>
        <p className="mt-1 text-sm text-dim">
          Espace collab : ajoutez, votez, suivez ce que vous regardez ensemble.
        </p>
      </div>

      <form
        onSubmit={onCreate}
        className="mb-6 flex flex-col gap-2 rounded-[14px] border border-line bg-raised p-4 sm:flex-row sm:items-center"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la liste (ex. Soirées anime)"
          maxLength={80}
          className="min-w-0 flex-1 rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/50"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="inline-flex items-center justify-center gap-2 rounded-[9px] bg-lime px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
        >
          <ListPlus className="size-4" />
          Créer
        </button>
      </form>
      {error ? <p className="mb-4 text-sm text-crimson">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-12 text-dim">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line px-4 py-10 text-center">
          <p className="text-sm text-dim">
            Aucune liste. Crée-en une, invite des amis, ajoutez 3 titres et votez pour la prochaine
            séance.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                to="/lists"
                search={{ id: l.id }}
                className="flex items-center gap-3 rounded-[12px] border border-line bg-raised px-4 py-3 transition hover:border-lime/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-dim">
                    <span>
                      {l.itemCount} titre{l.itemCount === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" />
                      {l.memberCount}
                    </span>
                    <span>
                      {l.myRole === "owner"
                        ? "Propriétaire"
                        : l.myRole === "viewer"
                          ? "Lecteur"
                          : "Éditeur"}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListDetail({ listId }: { listId: string }) {
  const { user, loading: authLoading } = useCurrentUserState();
  const navigate = useNavigate();
  const entries = useWatchlistStore((s) => s.entries);
  const hydrate = useWatchlistStore((s) => s.hydrate);
  const [detail, setDetail] = useState<SharedListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<AniListMedia[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"votes" | "recent" | "title">("votes");
  const [copied, setCopied] = useState(false);
  const [roulettePick, setRoulettePick] = useState<SharedListItem | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id || !listId) return;
    try {
      setDetail(await fetchSharedList(listId));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, listId]);

  useEffect(() => {
    if (user?.id) hydrate(user.id);
  }, [user?.id, hydrate]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload();
    const t = window.setInterval(() => void reload(), 15_000);
    return () => window.clearInterval(t);
  }, [user?.id, reload]);

  useEffect(() => {
    if (!user?.id) return;
    void listFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [user?.id]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void searchAniListQuery(q, ac.signal)
        .then((media) => setSearchHits(Array.isArray(media) ? media : []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [searchQ]);

  const memberIds = useMemo(
    () => new Set(detail?.members.map((m) => m.userId) ?? []),
    [detail],
  );
  const itemAnilistIds = useMemo(
    () => new Set(detail?.items.map((i) => i.anilistId) ?? []),
    [detail],
  );
  const invitable = friends.filter((f) => !memberIds.has(f.userId));
  const addable = entries.filter((e) => e.anilistId > 0 && !itemAnilistIds.has(e.anilistId));

  const filteredItems = useMemo(() => {
    let items = detail?.items ?? [];
    if (statusFilter !== "all") items = items.filter((i) => i.status === statusFilter);
    items = [...items];
    if (sortBy === "votes") {
      items.sort((a, b) => b.voteCount - a.voteCount || +new Date(b.createdAt) - +new Date(a.createdAt));
    } else if (sortBy === "title") {
      items.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    } else {
      items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return items;
  }, [detail, statusFilter, sortBy]);

  const nextUp = useMemo(() => {
    const pool = (detail?.items ?? []).filter(
      (i) => i.status === "planned" || i.status === "watching",
    );
    return [...pool].sort(
      (a, b) =>
        (b.status === "watching" ? 1 : 0) - (a.status === "watching" ? 1 : 0) ||
        b.voteCount - a.voteCount,
    )[0] ?? null;
  }, [detail]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20 text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-dim">
        <Link to="/login" className="text-lime">
          Connexion
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-dim">Liste introuvable ou accès refusé.</p>
        <button
          type="button"
          onClick={() => void navigate({ to: "/lists", search: {} })}
          className="mt-3 text-sm font-semibold text-lime"
        >
          Retour aux listes
        </button>
      </div>
    );
  }

  const { list, members, items } = detail;
  const isOwner = list.myRole === "owner";
  const canEdit = list.myRole === "owner" || list.myRole === "editor";

  const inviteUrl =
    list.inviteEnabled && list.inviteToken
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/lists?join=${list.inviteToken}`
      : null;

  return (
    <div className="mx-auto max-w-[720px] animate-fade-up">
      <div className="mb-5 flex items-start gap-3">
        <button
          type="button"
          onClick={() => void navigate({ to: "/lists", search: {} })}
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
          aria-label="Retour aux listes"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-medium">{list.name}</h1>
          {list.description ? (
            <p className="mt-1 text-sm text-dim">{list.description}</p>
          ) : null}
          <p className="mt-1 text-[11.5px] text-dim">
            {items.length} titres · {members.length} membres ·{" "}
            {isOwner ? "Propriétaire" : canEdit ? "Éditeur" : "Lecteur"}
          </p>
        </div>
        {isOwner ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditName(list.name);
                setEditDesc(list.description || "");
                setEditOpen((v) => !v);
              }}
              className="rounded-[8px] border border-line p-2 text-dim hover:text-lime"
              aria-label="Modifier"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Supprimer cette liste pour tout le monde ?")) return;
                void run(async () => {
                  await deleteSharedList(list.id);
                  void navigate({ to: "/lists", search: {} });
                });
              }}
              className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-crimson/40 hover:text-crimson"
            >
              Supprimer
            </button>
          </div>
        ) : null}
      </div>

      {editOpen && isOwner ? (
        <form
          className="mb-5 space-y-2 rounded-[14px] border border-line bg-raised p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await renameSharedList(list.id, editName.trim(), editDesc.trim());
              setEditOpen(false);
            });
          }}
        >
          <label className="block text-xs font-semibold text-dim">Nom</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={80}
            className="w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/50"
          />
          <label className="block text-xs font-semibold text-dim">Description</label>
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full resize-y rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || editName.trim().length < 2}
              className="rounded-[9px] bg-lime px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-[9px] border border-line px-3 py-1.5 text-xs font-semibold text-dim"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mb-4 text-sm text-crimson">{error}</p> : null}

      {/* Next session */}
      {nextUp ? (
        <section className="mb-5 overflow-hidden rounded-[14px] border border-lime/35 bg-lime/5">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            {nextUp.image ? (
              <img
                src={nextUp.image}
                alt=""
                className="mx-auto h-28 w-20 rounded-lg object-cover sm:mx-0"
              />
            ) : (
              <div className="mx-auto h-28 w-20 rounded-lg bg-line sm:mx-0" />
            )}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="text-[11px] font-bold tracking-wide text-lime uppercase">
                Prochaine séance
              </div>
              <div className="mt-0.5 font-serif text-lg font-semibold leading-snug">
                {nextUp.title}
              </div>
              <div className="mt-1 text-xs text-dim">
                {STATUS_LABEL[nextUp.status] || nextUp.status}
                {nextUp.voteCount > 0 ? ` · ${nextUp.voteCount} vote${nextUp.voteCount > 1 ? "s" : ""}` : ""}
              </div>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {nextUp.status !== "watching" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => setSharedListItemStatus(list.id, nextUp.id, "watching"))
                      }
                      className="inline-flex items-center gap-1 rounded-[9px] bg-lime px-3 py-1.5 text-xs font-bold text-bg"
                    >
                      <Play className="size-3.5" /> On regarde ça
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => setSharedListItemStatus(list.id, nextUp.id, "watched"))
                      }
                      className="inline-flex items-center gap-1 rounded-[9px] bg-lime px-3 py-1.5 text-xs font-bold text-bg"
                    >
                      <Check className="size-3.5" /> Marquer vu
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const pool = items.filter((i) => i.status === "planned");
                      if (pool.length === 0) return;
                      setRoulettePick(pool[Math.floor(Math.random() * pool.length)]!);
                    }}
                    className="inline-flex items-center gap-1 rounded-[9px] border border-line bg-raised px-3 py-1.5 text-xs font-semibold"
                  >
                    <Dices className="size-3.5" /> Roulette
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {roulettePick ? (
            <div className="border-t border-lime/20 bg-bg/40 px-4 py-3 text-sm">
              Tirage : <strong>{roulettePick.title}</strong>
              {canEdit ? (
                <button
                  type="button"
                  className="ml-2 text-xs font-semibold text-lime"
                  onClick={() =>
                    void run(async () => {
                      await setSharedListItemStatus(list.id, roulettePick.id, "watching");
                      setRoulettePick(null);
                    })
                  }
                >
                  Choisir celui-là
                </button>
              ) : null}
              <button
                type="button"
                className="ml-2 text-xs text-dim"
                onClick={() => setRoulettePick(null)}
              >
                Fermer
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Members + invite */}
      <section className="mb-5 rounded-[14px] border border-line bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Membres ({members.length})</h2>
          <div className="flex flex-wrap gap-2">
            {isOwner ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (list.inviteEnabled) await disableSharedListInvite(list.id);
                    else await enableSharedListInvite(list.id);
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-dim hover:text-lime"
              >
                <Link2 className="size-3.5" />
                {list.inviteEnabled ? "Désactiver le lien" : "Lien d’invitation"}
              </button>
            ) : null}
            {canEdit || isOwner ? (
              <button
                type="button"
                onClick={() => setMemberOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-lime"
              >
                <UserPlus className="size-3.5" />
                Inviter un ami
              </button>
            ) : null}
          </div>
        </div>

        {inviteUrl ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-lime/30 bg-lime/5 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{inviteUrl}</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* */
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-lime"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        ) : null}

        {memberOpen ? (
          <div className="mb-3 rounded-[10px] border border-line bg-bg p-2">
            {invitable.length === 0 ? (
              <p className="px-2 py-1 text-xs text-dim">Aucun ami à inviter (ou utilise le lien).</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {invitable.map((f) => (
                  <li key={f.userId} className="flex items-center gap-2 px-1 py-1">
                    <ProfileAvatar name={f.displayName} src={f.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.displayName}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => addSharedListMember(list.id, f.userId, "editor"))}
                      className="text-xs font-semibold text-lime"
                    >
                      Ajouter
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <ProfileAvatar name={m.displayName} src={m.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.displayName}</div>
                <div className="text-[11px] text-dim">
                  {m.role === "owner"
                    ? "Propriétaire"
                    : m.role === "viewer"
                      ? "Lecteur"
                      : "Éditeur"}{" "}
                  · @{m.username}
                </div>
              </div>
              {((isOwner && m.role !== "owner") || m.userId === user.id) && m.role !== "owner" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => removeSharedListMember(list.id, m.userId))}
                  className="text-xs text-dim hover:text-crimson"
                >
                  {m.userId === user.id ? "Quitter" : "Retirer"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Titles */}
      <section className="rounded-[14px] border border-line bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Titres ({items.length})</h2>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setPickOpen((v) => !v)}
              className="text-xs font-semibold text-lime"
            >
              {pickOpen ? "Fermer l’ajout" : "Ajouter des titres"}
            </button>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Tous
          </FilterChip>
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            >
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="ml-auto rounded-full border border-line bg-bg px-2.5 py-1 text-[11.5px]"
          >
            <option value="votes">Votes</option>
            <option value="recent">Récents</option>
            <option value="title">Titre</option>
          </select>
        </div>

        {pickOpen && canEdit ? (
          <div className="mb-4 space-y-3 rounded-[10px] border border-line bg-bg p-3">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-dim">
                <Search className="size-3.5" />
                Recherche AniList
              </div>
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Nom d’un anime…"
                className="w-full rounded-[9px] border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-lime/50"
              />
              {searching ? (
                <p className="mt-2 text-xs text-dim">Recherche…</p>
              ) : searchHits.length > 0 ? (
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                  {searchHits
                    .filter((m) => !itemAnilistIds.has(m.id))
                    .map((m) => {
                      const title = mediaTitle(m);
                      const image = m.coverImage?.large || null;
                      return (
                        <li key={m.id} className="flex items-center gap-2 px-1 py-1">
                          {image ? (
                            <img src={image} alt="" className="h-9 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-9 w-6 rounded bg-line" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                addSharedListItem(list.id, { anilistId: m.id, title, image }),
                              )
                            }
                            className="text-xs font-semibold text-lime"
                          >
                            Ajouter
                          </button>
                        </li>
                      );
                    })}
                </ul>
              ) : searchQ.trim().length >= 2 ? (
                <p className="mt-2 text-xs text-dim">Aucun résultat.</p>
              ) : null}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-dim">Depuis ma watchlist</span>
                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const batch = addable
                          .filter((e) => selectedIds.has(e.anilistId))
                          .map((e) => ({
                            anilistId: e.anilistId,
                            title: e.title,
                            image: e.image,
                          }));
                        await addSharedListItemsBulk(list.id, batch);
                        setSelectedIds(new Set());
                      })
                    }
                    className="text-xs font-semibold text-lime"
                  >
                    Ajouter la sélection ({selectedIds.size})
                  </button>
                ) : null}
              </div>
              {addable.length === 0 ? (
                <p className="text-xs text-dim">Rien à ajouter depuis ta liste.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {addable.slice(0, 60).map((e) => {
                    const selected = selectedIds.has(e.anilistId);
                    return (
                      <li key={e.id} className="flex items-center gap-2 px-1 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(e.anilistId)) next.delete(e.anilistId);
                              else next.add(e.anilistId);
                              return next;
                            });
                          }}
                          className={cn(
                            "flex size-5 items-center justify-center rounded border",
                            selected ? "border-lime bg-lime text-bg" : "border-line",
                          )}
                        >
                          {selected ? <Check className="size-3" /> : null}
                        </button>
                        {e.image ? (
                          <img src={e.image} alt="" className="h-9 w-6 rounded object-cover" />
                        ) : (
                          <div className="h-9 w-6 rounded bg-line" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              addSharedListItem(list.id, {
                                anilistId: e.anilistId,
                                title: e.title,
                                image: e.image,
                              }),
                            )
                          }
                          className="text-xs font-semibold text-lime"
                        >
                          +
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <p className="text-sm text-dim">
            {items.length === 0 ? "Aucun titre pour l’instant." : "Aucun titre pour ce filtre."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-2.5 py-2"
              >
                {item.image ? (
                  <img src={item.image} alt="" className="h-14 w-10 rounded object-cover" />
                ) : (
                  <div className="h-14 w-10 rounded bg-line" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-dim">
                    <span>{STATUS_LABEL[item.status] || item.status}</span>
                    <span>·</span>
                    <span>{item.addedByName}</span>
                  </div>
                  {canEdit ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy || item.status === s}
                          onClick={() => void run(() => setSharedListItemStatus(list.id, item.id, s))}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            item.status === s
                              ? "bg-lime/20 text-lime"
                              : "border border-line text-dim hover:border-lime/40",
                          )}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => toggleSharedListVote(list.id, item.id))}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold",
                    item.votedByMe ? "text-lime" : "text-dim hover:text-lime",
                  )}
                  aria-label="Voter"
                >
                  <Heart className={cn("size-4", item.votedByMe && "fill-lime")} />
                  {item.voteCount}
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => removeSharedListItem(list.id, item.id))}
                    className="rounded p-1.5 text-dim hover:text-crimson"
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
        active ? "border-lime bg-lime/15 text-lime" : "border-line bg-bg text-dim",
      )}
    >
      {children}
    </button>
  );
}
