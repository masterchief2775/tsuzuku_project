import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ListPlus,
  Loader2,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { AppPrimaryNav } from "@/components/tsuzuku/app-primary-nav";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listFriends, type FriendProfile } from "@/lib/friends";
import {
  addSharedListItem,
  addSharedListMember,
  createSharedList,
  deleteSharedList,
  fetchMySharedLists,
  fetchSharedList,
  removeSharedListItem,
  removeSharedListMember,
  renameSharedList,
  type SharedListDetail,
  type SharedListSummary,
} from "@/lib/shared-lists-client";
import {
  mediaTitle,
  searchAniListQuery,
  SEARCH_DEBOUNCE_MS,
  type AniListMedia,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

type ListsSearch = { id?: string };

export const Route = createFileRoute("/lists")({
  validateSearch: (search: Record<string, unknown>): ListsSearch => ({
    id: typeof search.id === "string" && search.id.trim() ? search.id.trim() : undefined,
  }),
  component: ListsPage,
});

function ListsPage() {
  const { id } = Route.useSearch();
  if (id) return <ListDetail listId={id} />;
  return <ListsIndex />;
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
    const t = window.setInterval(() => void reload(), 45_000);
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
      if (res?.id) {
        void navigate({ to: "/lists", search: { id: res.id } });
      }
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
    <div className="min-h-dvh">
      <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-[720px]">
          <AppPrimaryNav />
        </div>
      </div>
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="font-serif text-xl font-medium">Listes partagées</h1>
        <p className="mt-1 text-sm text-dim">
          Crée une liste, invite des amis, ajoutez des titres ensemble.
        </p>
      </div>

      <form
        onSubmit={onCreate}
        className="mb-6 flex flex-col gap-2 rounded-[14px] border border-line bg-raised p-4 sm:flex-row sm:items-center"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la liste (ex. Ciné-club)"
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
        <p className="text-sm text-dim">
          Aucune liste pour l’instant. Crée-en une et invite des amis pour ajouter des titres
          ensemble.
        </p>
      ) : (
        <ul className="space-y-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                to="/lists"
                search={{ id: l.id }}
                className="flex items-center gap-3 rounded-[12px] border border-line bg-raised px-4 py-3 hover:border-lime/40"
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
                    <span>{l.myRole === "owner" ? "Propriétaire" : "Membre"}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
    </div>
  );
}

function ListDetail({ listId }: { listId: string }) {
  const { user, loading: authLoading } = useCurrentUserState();
  const navigate = useNavigate();
  const entries = useWatchlistStore((s) => s.entries);
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
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload();
    const t = window.setInterval(() => void reload(), 45_000);
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
      window.clearInterval(t);
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
  const addable = entries.filter(
    (e) => e.anilistId > 0 && !itemAnilistIds.has(e.anilistId),
  );

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

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-[720px]">
          <AppPrimaryNav />
        </div>
      </div>
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-start gap-3">
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
            placeholder="Optionnel"
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

      <section className="mb-5 rounded-[14px] border border-line bg-raised p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Membres ({members.length})</h2>
          <button
            type="button"
            onClick={() => setMemberOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-lime"
          >
            <UserPlus className="size-3.5" />
            Inviter un ami
          </button>
        </div>
        {memberOpen ? (
          <div className="mb-3 rounded-[10px] border border-line bg-bg p-2">
            {invitable.length === 0 ? (
              <p className="px-2 py-1 text-xs text-dim">Aucun ami à inviter.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {invitable.map((f) => (
                  <li key={f.userId} className="flex items-center gap-2 px-1 py-1">
                    <ProfileAvatar name={f.displayName} src={f.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.displayName}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => addSharedListMember(list.id, f.userId))
                      }
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
                  {m.role === "owner" ? "Propriétaire" : "Éditeur"} · @{m.username}
                </div>
              </div>
              {((isOwner && m.role !== "owner") || m.userId === user.id) &&
              m.role !== "owner" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() => removeSharedListMember(list.id, m.userId))
                  }
                  className="text-xs text-dim hover:text-crimson"
                >
                  {m.userId === user.id ? "Quitter" : "Retirer"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[14px] border border-line bg-raised p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Titres ({items.length})</h2>
          <button
            type="button"
            onClick={() => setPickOpen((v) => !v)}
            className="text-xs font-semibold text-lime"
          >
            {pickOpen ? "Fermer l’ajout" : "Ajouter un titre"}
          </button>
        </div>
        {pickOpen ? (
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
                                addSharedListItem(list.id, {
                                  anilistId: m.id,
                                  title,
                                  image,
                                }),
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
              <div className="mb-1.5 text-xs font-semibold text-dim">Depuis ma watchlist</div>
              {addable.length === 0 ? (
                <p className="text-xs text-dim">Rien à ajouter depuis ta liste.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {addable.slice(0, 40).map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-1 py-1">
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
                        Ajouter
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm text-dim">Aucun titre pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-[10px] border border-line bg-bg px-2.5 py-2"
              >
                {item.image ? (
                  <img src={item.image} alt="" className="h-12 w-9 rounded object-cover" />
                ) : (
                  <div className="h-12 w-9 rounded bg-line" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="text-[11px] text-dim">Ajouté par {item.addedByName}</div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => removeSharedListItem(list.id, item.id))}
                  className="rounded p-1.5 text-dim hover:text-crimson"
                  aria-label="Retirer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
    </div>
}
