import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ListPlus, Loader2, Users } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  createSharedList,
  fetchMySharedLists,
  type SharedListSummary,
} from "@/lib/shared-lists-client";

export const Route = createFileRoute("/lists")({
  component: ListsPage,
});

function ListsPage() {
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
      const data = await fetchMySharedLists();
      setLists(data);
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
    const id = window.setInterval(() => void reload(), 45_000);
    return () => window.clearInterval(id);
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
      if (res.id) {
        void navigate({ to: "/lists/$listId", params: { listId: res.id } });
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
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
          aria-label="Retour"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="font-serif text-xl font-medium">Listes partagées</h1>
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
                to="/lists/$listId"
                params={{ listId: l.id }}
                className="flex items-center gap-3 rounded-[12px] border border-line bg-raised px-4 py-3 hover:border-lime/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-dim">
                    <span>{l.itemCount} titre{l.itemCount === 1 ? "" : "s"}</span>
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
  );
}
