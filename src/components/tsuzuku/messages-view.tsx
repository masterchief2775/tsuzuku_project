import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { searchProfiles, type PublicProfile } from "@/lib/profile";
import {
  listPrivateMessages,
  markPrivateMessagesRead,
  sendPrivateMessage,
  type PrivateMessage,
} from "@/lib/messages";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessagesView() {
  const { user } = useCurrentUserState();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [username, setUsername] = useState("");
  const [recipientResults, setRecipientResults] = useState<PublicProfile[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setMessages(await listPrivateMessages());
      await markPrivateMessagesRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les messages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const query = username.trim();
    if (query.length < 2) {
      setRecipientResults([]);
      return;
    }
    let cancelled = false;
    void searchProfiles({ data: { q: query } }).then((results) => {
      if (!cancelled) setRecipientResults(results.filter((profile) => profile.userId !== user?.id));
    }).catch(() => {
      if (!cancelled) setRecipientResults([]);
    });
    return () => {
      cancelled = true;
    };
  }, [username, user?.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    setFeedback("");
    try {
      await sendPrivateMessage({ data: { username, body } });
      setUsername("");
      setRecipientResults([]);
      setBody("");
      setFeedback("Message envoyé");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’envoyer le message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-dim">Échange simplement avec les utilisateurs de Tsuzuku.</p>
      </div>

      <section className="ui-panel mb-5 p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4 text-lime" /> Nouveau message
        </h2>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="relative">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="ui-input"
              placeholder="Rechercher un destinataire…"
              aria-label="Rechercher un destinataire"
              autoComplete="off"
              required
            />
            {recipientResults.length > 0 ? (
              <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-[12px] border border-line bg-raised shadow-xl">
                {recipientResults.map((profile) => (
                  <button
                    key={profile.userId}
                    type="button"
                    onClick={() => {
                      setUsername(profile.username);
                      setRecipientResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-bg"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">{profile.displayName}</span>
                    <span className="shrink-0 text-xs text-dim">@{profile.username}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="ui-input min-h-24 resize-y"
            placeholder="Écris ton message…"
            aria-label="Message"
            maxLength={2000}
            required
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-dim">{body.length}/2000</span>
            <button type="submit" disabled={sending} className="ui-button-primary w-auto px-5 disabled:opacity-60">
              <Send className="size-4" /> Envoyer
            </button>
          </div>
        </form>
        {feedback ? <p className="mt-3 text-xs font-semibold text-emerald-400">{feedback}</p> : null}
        {error ? <p className="mt-3 text-xs font-semibold text-crimson">{error}</p> : null}
      </section>

      <section className="ui-panel p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-lime" /> Boîte de réception
        </h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-dim">Chargement…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-dim">Aucun message pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => {
              const received = message.receiverId !== user?.id;
              return (
                <article key={message.id} className="rounded-[12px] border border-line bg-bg p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm">
                      {received ? `De ${message.senderName}` : `À ${message.receiverName}`}
                    </strong>
                    <time className="shrink-0 text-[11px] text-dim">{formatDate(message.createdAt)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-dim">{message.body}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
