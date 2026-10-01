import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Dices,
  Link2,
  Loader2,
  LogOut,
  Minus,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useVisiblePolling } from "@/lib/polling";
import { useWatchlistStore } from "@/store/watchlist-store";
import {
  closeParty,
  getParty,
  joinPartyByToken,
  leaveParty,
  postPartyMessage,
  setPartyEpisode,
  setPartyStatus,
  type PartyDetail,
  type PartyMemberStatus,
} from "@/lib/party";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/party/$roomId")({
  component: PartyRoomPage,
});

const STATUS_META: { id: PartyMemberStatus; label: string }[] = [
  { id: "ready", label: "Prêt" },
  { id: "paused", label: "En pause" },
  { id: "done", label: "Terminé" },
];

function statusLabel(s: PartyMemberStatus) {
  return s === "ready" ? "Prêt" : s === "paused" ? "En pause" : "Terminé";
}

function PartyRoomPage() {
  const { roomId } = Route.useParams();
  const search = useSearch({ strict: false }) as { join?: string };
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const entries = useWatchlistStore((s) => s.entries);
  const setProgress = useWatchlistStore((s) => s.setProgress);
  const showToast = useWatchlistStore((s) => s.showToast);

  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [epDraft, setEpDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgId = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try {
      const d = await getParty({ data: { roomId } });
      setDetail(d);
      setError("");
      const last = d.messages[d.messages.length - 1];
      if (last && last.id !== lastMsgId.current) {
        lastMsgId.current = last.id;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Session introuvable";
      // Room deleted (closed) → back to lists instead of a dead poll.
      if (/terminée|introuvable/i.test(msg)) {
        void navigate({ to: "/lists", search: { id: undefined, join: undefined } });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user?.id, roomId, navigate]);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setError("");
    lastMsgId.current = null;
  }, [roomId]);

  // Session state: fast poll while open (chat + readiness need it).
  useVisiblePolling(reload, 4000, Boolean(user?.id));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [detail?.messages.length]);

  async function join() {
    const token = search.join?.trim();
    if (!token) {
      setError("Lien d’invitation incomplet (token manquant)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await joinPartyByToken({ data: { token } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de rejoindre");
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  function applyEpisodeToMyList() {
    if (!detail) return;
    const entry = detail.anilistId != null
      ? entries.find((e) => e.anilistId === detail.anilistId)
      : undefined;
    if (!entry) {
      showToast({ message: "Ajoute d’abord ce titre à ta watchlist" });
      return;
    }
    setProgress(entry.id, detail.episode);
    showToast({ message: `Progression calée sur l’épisode ${detail.episode}` });
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const body = chatBody.trim();
    if (!body || busy) return;
    setChatBody("");
    try {
      await postPartyMessage({ data: { roomId, body: body.slice(0, 1000) } });
      await reload();
    } catch (err) {
      setChatBody(body);
      showToast({ message: err instanceof Error ? err.message : "Envoi impossible" });
    }
  }

  if (isPending || loading) {
    return (
      <div className="flex justify-center py-20 text-dim">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-dim">
        Connecte-toi pour rejoindre la session.
      </div>
    );
  }
  if (error && !detail) {
    const needsJoin = /participe/i.test(error) && search.join;
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Dices className="mx-auto mb-3 size-8 text-dim" />
        <p className="text-sm text-dim">{error}</p>
        {needsJoin ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void join()}
            className="mt-4 rounded-[9px] bg-lime px-5 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
          >
            {busy ? "…" : "Rejoindre la session"}
          </button>
        ) : (
          <Link
            to="/lists"
            search={{ id: undefined, join: undefined }}
            className="mt-4 inline-block text-sm font-semibold text-lime"
          >
            Retour aux listes
          </Link>
        )}
      </div>
    );
  }
  if (!detail) return null;

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/party/${detail.roomId}?join=${detail.inviteToken}`
      : "";
  const allDone = detail.members.length > 0 && detail.members.every((m) => m.status === "done");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/lists"
          search={{ id: undefined, join: undefined }}
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
          aria-label="Retour aux listes"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-xl font-medium">{detail.title}</h1>
          <p className="text-xs text-dim">
            Session synchro · épisode {detail.episode}
            {allDone ? " · tout le monde a terminé 🎉" : ""}
          </p>
        </div>
      </div>

      {/* Shared episode cursor */}
      <section className="mb-4 rounded-[14px] border border-lime/30 bg-lime/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-dim">Épisode commun</span>
          <div className="ml-auto flex items-center gap-1.5">
            {detail.isHost ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setPartyEpisode({ data: { roomId, episode: detail.episode - 1 } }))}
                  className="rounded-[8px] border border-line bg-bg p-1.5 text-dim hover:text-ink disabled:opacity-40"
                  aria-label="Épisode précédent"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-10 text-center font-serif text-2xl font-semibold">
                  {detail.episode}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setPartyEpisode({ data: { roomId, episode: detail.episode + 1 } }))}
                  className="rounded-[8px] border border-line bg-bg p-1.5 text-dim hover:text-ink disabled:opacity-40"
                  aria-label="Épisode suivant"
                >
                  <Plus className="size-3.5" />
                </button>
                <form
                  className="ml-1 flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(epDraft);
                    if (!Number.isFinite(n)) return;
                    setEpDraft("");
                    void run(() => setPartyEpisode({ data: { roomId, episode: n } }));
                  }}
                >
                  <input
                    value={epDraft}
                    onChange={(e) => setEpDraft(e.target.value)}
                    placeholder="N°"
                    inputMode="numeric"
                    aria-label="Aller à l’épisode"
                    className="w-14 rounded-[8px] border border-line bg-bg px-2 py-1.5 text-center text-sm outline-none"
                  />
                </form>
              </>
            ) : (
              <span className="font-serif text-2xl font-semibold">{detail.episode}</span>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {STATUS_META.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy || detail.myStatus === s.id}
                onClick={() => void run(() => setPartyStatus({ data: { roomId, status: s.id } }))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                  detail.myStatus === s.id
                    ? "border-lime/50 bg-lime/15 text-lime"
                    : "border-line bg-bg text-dim hover:text-ink",
                )}
              >
                {detail.myStatus === s.id ? <Check className="mr-1 inline size-3" /> : null}
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applyEpisodeToMyList}
            className="ml-auto text-xs font-semibold text-lime hover:underline"
          >
            Appliquer à ma liste
          </button>
        </div>
      </section>

      {/* Members */}
      <section className="mb-4 rounded-[14px] border border-line bg-raised p-4">
        <h2 className="mb-2 text-sm font-semibold">Participants ({detail.members.length})</h2>
        <ul className="space-y-2">
          {detail.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2.5">
              <ProfileAvatar name={m.displayName} src={m.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {m.displayName}
                  {m.isHost ? <span className="ml-1.5 text-[10px] text-dim">HÔTE</span> : null}
                  {m.userId === user.id ? <span className="ml-1.5 text-[10px] text-lime">toi</span> : null}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  m.status === "done"
                    ? "bg-lime/15 text-lime"
                    : m.status === "paused"
                      ? "bg-amber-500/15 text-amber-200"
                      : "bg-bg text-dim",
                )}
              >
                {statusLabel(m.status)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(inviteUrl).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-lime hover:underline"
        >
          {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          {copied ? "Lien copié !" : "Copier le lien d’invitation"}
        </button>
      </section>

      {/* Ephemeral chat */}
      <section className="mb-4 overflow-hidden rounded-[14px] border border-line bg-raised">
        <div ref={scrollRef} className="max-h-72 space-y-2.5 overflow-y-auto p-4">
          {detail.messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-dim">
              Silence radio… lancez la lecture et synchronisez-vous ici.
            </p>
          ) : (
            detail.messages.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-[10px] px-3 py-1.5 text-sm",
                      mine ? "bg-lime/15 text-ink" : "bg-bg text-ink",
                    )}
                  >
                    {!mine ? (
                      <div className="text-[11px] font-semibold text-dim">{m.senderName}</div>
                    ) : null}
                    <div>{m.body}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={sendChat} className="flex gap-2 border-t border-line p-3">
          <input
            value={chatBody}
            onChange={(e) => setChatBody(e.target.value)}
            placeholder="Message…"
            maxLength={1000}
            aria-label="Message de session"
            className="min-w-0 flex-1 rounded-[9px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/50"
          />
          <button
            type="submit"
            disabled={!chatBody.trim() || busy}
            className="rounded-[9px] bg-lime p-2 text-bg disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send className="size-4" />
          </button>
        </form>
      </section>

      {/* Danger zone */}
      <div className="flex flex-wrap gap-2">
        {detail.isHost ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Fermer la session pour tout le monde ? (chat effacé)")) return;
              void (async () => {
                await closeParty({ data: { roomId } });
                void navigate({ to: "/lists", search: { id: undefined, join: undefined } });
              })();
            }}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-2 text-xs font-semibold text-dim hover:border-crimson/40 hover:text-crimson"
          >
            <XCircle className="size-3.5" />
            Fermer la session
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                await leaveParty({ data: { roomId } });
                void navigate({ to: "/lists", search: { id: undefined, join: undefined } });
              })();
            }}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-2 text-xs font-semibold text-dim hover:text-ink"
          >
            <LogOut className="size-3.5" />
            Quitter
          </button>
        )}
      </div>
    </div>
  );
}
