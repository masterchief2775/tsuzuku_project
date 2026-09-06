import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { searchProfiles, type PublicProfile } from "@/lib/profile";
import {
  getUnreadMessageCount,
  listConversations,
  listThread,
  markThreadRead,
  sendMessageToUser,
  sendPrivateMessage,
  type ConversationSummary,
  type PrivateMessage,
} from "@/lib/messages";

const THREAD_POLL_MS = 3000;
const LIST_POLL_MS = 8000;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(value));
}

/** True while the tab is actually visible — pauses polling instead of hammering the DB in a background tab. */
function useIsVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);
  return visible;
}

/** Poll `fn` every `ms` while `enabled`, immediately on mount/enable and again whenever the tab regains focus. */
function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const visible = useIsVisible();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || !visible) return;
    fnRef.current();
    const id = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(id);
  }, [enabled, visible, ms]);
}

type OptimisticMessage = PrivateMessage & { pending?: boolean };

export function MessagesView() {
  const { user } = useCurrentUserState();
  const search = useSearch({ strict: false }) as { to?: string };

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ConversationSummary | PublicProfile | null>(null);
  const [threadMessages, setThreadMessages] = useState<OptimisticMessage[]>([]);
  const [threadLoaded, setThreadLoaded] = useState(false);

  const [composeUsername, setComposeUsername] = useState("");
  const [recipientResults, setRecipientResults] = useState<PublicProfile[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const refreshConversations = useCallback(() => {
    void listConversations()
      .then((rows) => {
        setConversations(rows);
        setConversationsLoaded(true);
      })
      .catch(() => setConversationsLoaded(true));
  }, []);

  const refreshThread = useCallback((withUserId: string) => {
    void listThread({ data: { withUserId } })
      .then((rows) => {
        setThreadMessages((current) => {
          // Drop any optimistic temp messages once the real one has landed —
          // matched by sender+body, since the server assigns the real id.
          const pendingStillUnconfirmed = current.filter(
            (m) => m.pending && !rows.some((r) => r.senderId === m.senderId && r.body === m.body),
          );
          return [...rows, ...pendingStillUnconfirmed];
        });
        setThreadLoaded(true);
        const last = rows[rows.length - 1];
        if (last && last.id !== lastMessageIdRef.current) {
          lastMessageIdRef.current = last.id;
          // New message landed (from either side) — the read state may have
          // changed too, so keep the conversation list's unread badge fresh.
          refreshConversations();
        }
        if (rows.some((m) => m.senderId === withUserId && !m.readAt)) {
          void markThreadRead({ data: { withUserId } });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger la conversation."));
  }, [refreshConversations]);

  // Conversation list: kept fresh in the background whenever no thread is open.
  usePolling(refreshConversations, LIST_POLL_MS, activeUserId === null);
  // Active thread: polled quickly for the "instant" feel while it's open.
  usePolling(() => activeUserId && refreshThread(activeUserId), THREAD_POLL_MS, activeUserId !== null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [threadMessages]);

  function openThread(userId: string, profile?: PublicProfile | ConversationSummary) {
    setActiveUserId(userId);
    setActiveProfile(profile ?? conversations.find((c) => c.userId === userId) ?? null);
    setThreadMessages([]);
    setThreadLoaded(false);
    lastMessageIdRef.current = null;
    setError("");
    refreshThread(userId);
  }

  // Deep link from a profile page (?to=<userId>) opens straight into that thread.
  useEffect(() => {
    if (search.to && search.to !== activeUserId) openThread(search.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.to]);

  function backToList() {
    setActiveUserId(null);
    setActiveProfile(null);
    setThreadMessages([]);
    refreshConversations();
  }

  useEffect(() => {
    const query = composeUsername.trim();
    if (query.length < 2) {
      setRecipientResults([]);
      return;
    }
    let cancelled = false;
    void searchProfiles({ data: { q: query } })
      .then((results) => {
        if (!cancelled) setRecipientResults(results.filter((p) => p.userId !== user?.id));
      })
      .catch(() => {
        if (!cancelled) setRecipientResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [composeUsername, user?.id]);

  async function submitNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      const { receiverId } = await sendPrivateMessage({ data: { username: composeUsername, body } });
      setComposeUsername("");
      setRecipientResults([]);
      setBody("");
      refreshConversations();
      openThread(receiverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  }

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (sending || !text || !activeUserId || !user) return;
    setSending(true);
    setError("");
    const optimistic: OptimisticMessage = {
      id: `temp_${Date.now()}`,
      senderId: user.id,
      receiverId: activeUserId,
      body: text,
      createdAt: new Date().toISOString(),
      readAt: null,
      pending: true,
    };
    setThreadMessages((current) => [...current, optimistic]);
    setBody("");
    try {
      await sendMessageToUser({ data: { receiverId: activeUserId, body: text } });
      refreshThread(activeUserId);
    } catch (err) {
      setThreadMessages((current) => current.filter((m) => m.id !== optimistic.id));
      setBody(text);
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  }

  const activeName = useMemo(() => {
    if (!activeProfile) return "…";
    return "displayName" in activeProfile ? activeProfile.displayName : "";
  }, [activeProfile]);
  const activeAvatar = activeProfile && "avatarUrl" in activeProfile ? activeProfile.avatarUrl : null;

  if (activeUserId) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-140px)] max-w-2xl animate-fade-up flex-col">
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={backToList}
            className="rounded-[9px] border border-line bg-raised p-2 text-dim hover:text-ink"
            aria-label="Retour aux conversations"
          >
            <ArrowLeft className="size-4" />
          </button>
          <ProfileAvatar name={activeName} src={activeAvatar} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{activeName}</div>
          </div>
        </div>

        <div ref={scrollRef} className="ui-panel flex-1 space-y-3 overflow-y-auto p-4">
          {!threadLoaded ? (
            <p className="py-8 text-center text-sm text-dim">Chargement…</p>
          ) : threadMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-dim">Dis bonjour 👋</p>
          ) : (
            threadMessages.map((message, i) => {
              const mine = message.senderId === user?.id;
              const prev = threadMessages[i - 1];
              const showDay = !prev || formatDay(prev.createdAt) !== formatDay(message.createdAt);
              return (
                <div key={message.id}>
                  {showDay ? (
                    <div className="my-3 text-center text-[11px] font-semibold text-dim">
                      {formatDay(message.createdAt)}
                    </div>
                  ) : null}
                  <div className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        mine
                          ? "max-w-[75%] rounded-[14px] rounded-br-[4px] bg-lime px-3.5 py-2 text-sm font-medium text-bg"
                          : "max-w-[75%] rounded-[14px] rounded-bl-[4px] border border-line bg-bg px-3.5 py-2 text-sm text-ink"
                      }
                    >
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <div className={mine ? "mt-1 text-right text-[10px] text-bg/70" : "mt-1 text-[10px] text-dim"}>
                        {formatTime(message.createdAt)}
                        {message.pending ? " · envoi…" : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error ? <p className="mt-2 text-xs font-semibold text-crimson">{error}</p> : null}

        <form onSubmit={(event) => void submitReply(event)} className="mt-3 flex items-end gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitReply(event as unknown as React.FormEvent<HTMLFormElement>);
              }
            }}
            className="ui-input min-h-11 flex-1 resize-none py-2.5"
            placeholder="Écris un message…"
            rows={1}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="ui-button-primary w-auto shrink-0 px-4 disabled:opacity-60"
            aria-label="Envoyer"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-dim">Échange en direct avec les utilisateurs de Tsuzuku.</p>
      </div>

      <section className="ui-panel mb-5 p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4 text-lime" /> Nouveau message
        </h2>
        <form className="space-y-3" onSubmit={(event) => void submitNew(event)}>
          <div className="relative">
            <input
              value={composeUsername}
              onChange={(event) => setComposeUsername(event.target.value)}
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
                      setComposeUsername(profile.username);
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
            className="ui-input min-h-20 resize-y"
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
        {error ? <p className="mt-3 text-xs font-semibold text-crimson">{error}</p> : null}
      </section>

      <section className="ui-panel p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-lime" /> Conversations
        </h2>
        {!conversationsLoaded ? (
          <p className="py-8 text-center text-sm text-dim">Chargement…</p>
        ) : conversations.length === 0 ? (
          <p className="py-8 text-center text-sm text-dim">Aucune conversation pour le moment.</p>
        ) : (
          <div className="divide-y divide-line">
            {conversations.map((c) => (
              <button
                key={c.userId}
                type="button"
                onClick={() => openThread(c.userId, c)}
                className="flex w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-bg"
              >
                <ProfileAvatar name={c.displayName} src={c.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.displayName}</span>
                    <span className="shrink-0 text-[11px] text-dim">{formatTime(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-dim">
                    {c.lastMessageFromMe ? "Toi : " : ""}
                    {c.lastMessage}
                  </p>
                </div>
                {c.unreadCount > 0 ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-bg">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Exported for the nav badge (app-primary-nav.tsx) — same short polling helper, standalone. */
export function useUnreadMessageCount() {
  const [count, setCount] = useState(0);
  usePolling(
    () => {
      void getUnreadMessageCount()
        .then(setCount)
        .catch(() => {});
    },
    15000,
    true,
  );
  return count;
}
