import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listFriends, type FriendProfile } from "@/lib/friends";
import {
  addSharedListItem,
  addSharedListMember,
  deleteSharedList,
  fetchSharedList,
  removeSharedListItem,
  removeSharedListMember,
  type SharedListDetail,
} from "@/lib/shared-lists-client";
import { useWatchlistStore } from "@/store/watchlist-store";

export const Route = createFileRoute("/lists/$listId")({
  component: ListDetailPage,
});

function ListDetailPage() {
  const { listId } = Route.useParams();
  const { user, loading: authLoading } = useCurrentUserState();
  const entries = useWatchlistStore((s) => s.entries);
  const [detail, setDetail] = useState<SharedListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id || !listId) return;
    try {
      const d = await fetchSharedList(listId);
      setDetail(d);
    } catch {
      /* */
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
    const id = window.setInterval(() => void reload(), 45_000);
    return () => window.clearInterval(id);
  }, [user?.id, reload]);

  useEffect(() => {
    if (!user?.id) return;
    void listFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [user?.id]);

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
        <Link to="/lists" className="mt-3 inline-block text-sm text-lime">
          Retour aux listes
        </Link>
      </div>
    );
  }

  const { list, members, items } = detail;
  const isOwner = list.myRole === "owner";

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start gap-3">
        <Link
          to="/lists"
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-medium">{list.name}</h1>
          {list.description ? (
            <p className="mt-1 text-sm text-dim">{list.description}</p>
          ) : null}
        </div>
        {isOwner ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Supprimer cette liste pour tout le monde ?")) return;
              void run(async () => {
                await deleteSharedList(list.id);
                window.location.href = "/lists";
              });
            }}
            className="rounded-[8px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-crimson/40 hover:text-crimson"
          >
            Supprimer
          </button>
        ) : null}
      </div>

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
              {(isOwner && m.role !== "owner") || m.userId === user.id ? (
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
                ) : null
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
            {pickOpen ? "Fermer" : "Ajouter depuis ma watchlist"}
          </button>
        </div>
        {pickOpen ? (
          <div className="mb-3 max-h-48 overflow-y-auto rounded-[10px] border border-line bg-bg p-2">
            {addable.length === 0 ? (
              <p className="px-2 py-1 text-xs text-dim">
                Rien à ajouter (vide ou déjà dans la liste).
              </p>
            ) : (
              <ul className="space-y-1">
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
}
