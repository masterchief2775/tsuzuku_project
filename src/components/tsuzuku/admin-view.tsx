import { useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { deleteAdminUser, getAdminStatus, listAdminUsers, setAdminRole, type AdminUser } from "@/lib/admin";

export function AdminView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const status = await getAdminStatus();
      setAllowed(status.isAdmin);
      if (status.isAdmin) setUsers(await listAdminUsers());
    } catch (err) {
      setAllowed(false);
      setError(err instanceof Error ? err.message : "Impossible de charger l’administration.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeRole(user: AdminUser) {
    const role = user.role === "admin" ? "user" : "admin";
    setBusyId(user.id);
    setError("");
    try {
      await setAdminRole({ data: { userId: user.id, role } });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, role } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de modifier le rôle.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`Supprimer définitivement le compte ${user.email} ?`)) return;
    setBusyId(user.id);
    setError("");
    try {
      await deleteAdminUser({ data: { userId: user.id } });
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer le compte.");
    } finally {
      setBusyId(null);
    }
  }

  if (allowed === null) return <p className="py-16 text-center text-sm text-dim">Chargement…</p>;
  if (!allowed) {
    return (
      <div className="ui-panel mx-auto max-w-xl p-8 text-center">
        <ShieldCheck className="mx-auto size-8 text-dim" />
        <h1 className="mt-3 font-serif text-xl font-semibold">Accès refusé</h1>
        <p className="mt-1 text-sm text-dim">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="size-6 text-lime" />
        <div>
          <h1 className="font-serif text-2xl font-semibold">Administration</h1>
          <p className="text-sm text-dim">Gestion des utilisateurs et des rôles.</p>
        </div>
      </div>
      {error ? <p className="mb-4 rounded-md border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{error}</p> : null}
      <section className="ui-panel overflow-hidden p-2 sm:p-3">
        <div className="divide-y divide-line">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center gap-3 px-2 py-3 sm:px-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="truncate text-xs text-dim">{user.email}</div>
              </div>
              <span className="rounded-full border border-line px-2 py-1 text-[11px] font-semibold text-dim">
                {user.role}
              </span>
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => void changeRole(user)}
                className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-lime/40 hover:text-ink disabled:opacity-50"
              >
                {user.role === "admin" ? "Retirer admin" : "Rendre admin"}
              </button>
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => void deleteUser(user)}
                className="inline-flex items-center gap-1 rounded-[9px] border border-crimson/30 px-2.5 py-1.5 text-xs font-semibold text-crimson hover:bg-crimson/10 disabled:opacity-50"
                aria-label={`Supprimer ${user.email}`}
                title="Supprimer le compte"
              >
                <Trash2 className="size-3.5" />
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
