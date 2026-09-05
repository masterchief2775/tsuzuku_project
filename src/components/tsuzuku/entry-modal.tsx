import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, RefreshCw, Star, Trash2, UserPlus, X } from "lucide-react";
import { Cover } from "@/components/tsuzuku/cover";
import { ProfileAvatar } from "@/components/tsuzuku/profile-avatar";
import { cn } from "@/lib/utils";
import { listFriends, type FriendProfile } from "@/lib/friends";
import { publishWatchActivity } from "@/lib/activity-client";
import { kindLabel, mediaKind, STATUSES, statusMeta } from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";

export function EntryModal() {
  const activeEntryId = useWatchlistStore((s) => s.activeEntryId);
  const entries = useWatchlistStore((s) => s.entries);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const updateEntry = useWatchlistStore((s) => s.updateEntry);

  const notifyWatch = (
    kind: "completed" | "rated",
    e: NonNullable<typeof entry>,
    rating?: number | null,
  ) => {
    void publishWatchActivity({
      kind,
      title: e.title,
      anilistId: e.anilistId,
      image: e.image,
      rating: rating ?? e.rating ?? null,
    });
  };

  const bumpProgress = useWatchlistStore((s) => s.bumpProgress);
  const setProgress = useWatchlistStore((s) => s.setProgress);
  const removeEntry = useWatchlistStore((s) => s.removeEntry);
  const refreshFromAniList = useWatchlistStore((s) => s.refreshFromAniList);
  const refreshingId = useWatchlistStore((s) => s.refreshingId);
  const entry = entries.find((e) => e.id === activeEntryId) ?? null;
  const [confirming, setConfirming] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);

  useEffect(() => {
    setConfirming(false);
    setTagDraft("");
    setFriendPickerOpen(false);
  }, [activeEntryId]);

  useEffect(() => {
    let cancelled = false;
    void listFriends()
      .then((list) => {
        if (!cancelled) {
          setFriends(list);
          setFriendsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFriendsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!entry) return null;

  const meta = statusMeta(entry.status);
  const kind = mediaKind(entry.format, entry.totalEpisodes);
  const kindTxt = kindLabel(kind);
  const totalLabel =
    kind !== "series" && (!entry.totalEpisodes || entry.totalEpisodes === 1)
      ? kindTxt
      : String(entry.totalEpisodes ?? "?");
  const withPeople = entry.withPeople || [];

  const friendById = new Map(friends.map((f) => [f.userId, f]));
  const selectedFriends = withPeople
    .map((id) => friendById.get(id))
    .filter(Boolean) as FriendProfile[];
  // Legacy free-text names (not matching a known friend id)
  const legacyNames = withPeople.filter((id) => !friendById.has(id));
  const availableFriends = friends.filter((f) => !withPeople.includes(f.userId));

  function addTag() {
    const t = tagDraft.trim();
    if (!t || entry!.tags.includes(t)) return;
    updateEntry(entry!.id, { tags: [...entry!.tags, t] });
    setTagDraft("");
  }

  function toggleFriend(userId: string) {
    const people = entry!.withPeople || [];
    if (people.includes(userId)) {
      updateEntry(entry!.id, { withPeople: people.filter((x) => x !== userId) });
    } else {
      updateEntry(entry!.id, { withPeople: [...people, userId] });
    }
  }

  function removePerson(value: string) {
    const people = entry!.withPeople || [];
    updateEntry(entry!.id, { withPeople: people.filter((x) => x !== value) });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) setActiveEntryId(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-modal-title"
        className="relative max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-xl border border-line bg-raised p-6"
        style={{ ["--accent" as string]: meta.color }}
      >
        <button
          type="button"
          aria-label="Fermer"
          className="absolute top-4 right-4 text-dim"
          onClick={() => setActiveEntryId(null)}
        >
          <X className="size-5" />
        </button>

        <div className="mb-5 flex gap-3.5">
          <Cover
            src={entry.image}
            title={entry.title}
            className="h-[110px] w-20 shrink-0 rounded-sm"
          />
          <div className="min-w-0 pr-6">
            <h2 id="entry-modal-title" className="font-serif text-[19px] font-semibold">
              {entry.title}
            </h2>
            <div className="mt-1 text-xs text-dim">
              {entry.year || "—"}
              {entry.studio ? ` · ${entry.studio}` : ""}
              {kindTxt ? ` · ${kindTxt}` : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.genres.slice(0, 4).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10.5px] text-dim"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Field label="Statut">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  updateEntry(entry.id, { status: s.key });
                  if (s.key === "Completed" && entry.status !== "Completed") {
                    notifyWatch("completed", entry);
                  }
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold",
                  entry.status === s.key
                    ? "border-transparent text-bg"
                    : "border-line bg-bg text-dim",
                )}
                style={
                  entry.status === s.key
                    ? { background: s.color }
                    : { ["--accent" as string]: s.color }
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Progression">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Épisode précédent"
                className="flex size-[30px] items-center justify-center rounded-sm border border-line bg-bg"
                onClick={() => bumpProgress(entry.id, -1)}
              >
                <Minus className="size-3.5" />
              </button>
              <input
                type="number"
                min={0}
                value={entry.progress}
                onChange={(ev) => setProgress(entry.id, Number(ev.target.value) || 0)}
                className="w-[50px] rounded-sm border border-line bg-bg py-1.5 text-center text-sm"
              />
              <span className="text-xs text-dim">/ {totalLabel}</span>
              <button
                type="button"
                aria-label="Épisode suivant"
                className="flex size-[30px] items-center justify-center rounded-sm border border-line bg-bg"
                onClick={() => bumpProgress(entry.id, 1)}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </Field>
          <Field label="Note">
            <div className="flex flex-wrap items-center gap-0.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Note ${n} sur 10`}
                  onClick={() =>
                    updateEntry(entry.id, { rating: entry.rating === n ? null : n })
                  }
                >
                  <Star
                    className={cn(
                      "size-4",
                      entry.rating != null && entry.rating >= n
                        ? "fill-lime text-lime"
                        : "text-line",
                    )}
                  />
                </button>
              ))}
              <span className="ml-1.5 text-xs text-dim">
                {entry.rating != null ? `${entry.rating}/10` : "—"}
              </span>
            </div>
          </Field>
        </div>

        <Field label="Avis personnel">
          <textarea
            rows={3}
            placeholder="Tes impressions, à chaud ou à froid…"
            defaultValue={entry.comment}
            key={entry.id + "-comment"}
            onBlur={(ev) => updateEntry(entry.id, { comment: ev.target.value })}
            className="w-full resize-y rounded-sm border border-line bg-bg p-2.5 text-[13px]"
          />
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-1 text-[11.5px] text-dim"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Retirer ${t}`}
                  onClick={() =>
                    updateEntry(entry.id, { tags: entry.tags.filter((x) => x !== t) })
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(ev) => setTagDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  addTag();
                }
              }}
              placeholder="+ ajouter un tag"
              className="rounded-full border border-dashed border-line bg-bg px-3 py-1 text-[11.5px] outline-none"
            />
          </div>
        </Field>

        <Field label="Vu avec (amis)">
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedFriends.map((f) => (
              <span
                key={f.userId}
                className="flex items-center gap-1.5 rounded-full border border-line bg-bg py-0.5 pr-1.5 pl-0.5 text-[11.5px] text-dim"
              >
                <ProfileAvatar name={f.displayName} src={f.avatarUrl} size="xs" />
                <span className="max-w-[100px] truncate">{f.displayName}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:text-crimson"
                  aria-label={`Retirer ${f.displayName}`}
                  onClick={() => removePerson(f.userId)}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {legacyNames.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11.5px] text-amber-200"
                title="Ancien nom libre — retire-le ou remplace-le par un ami"
              >
                {name}
                <button
                  type="button"
                  className="hover:text-crimson"
                  aria-label={`Retirer ${name}`}
                  onClick={() => removePerson(name)}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setFriendPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line bg-bg px-2.5 py-1 text-[11.5px] font-semibold text-dim hover:border-lime/50 hover:text-ink"
            >
              <UserPlus className="size-3" />
              Ajouter un ami
            </button>
          </div>
          {friendPickerOpen ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-[10px] border border-line bg-bg p-2">
              {!friendsLoaded ? (
                <p className="px-1 py-2 text-xs text-dim">Chargement des amis…</p>
              ) : friends.length === 0 ? (
                <p className="px-1 py-2 text-xs text-dim">
                  Aucun ami pour l&apos;instant.{" "}
                  <Link to="/friends" className="font-semibold text-lime">
                    Gérer les amis
                  </Link>
                </p>
              ) : availableFriends.length === 0 ? (
                <p className="px-1 py-2 text-xs text-dim">Tous tes amis sont déjà listés.</p>
              ) : (
                <ul className="space-y-1">
                  {availableFriends.map((f) => (
                    <li key={f.userId}>
                      <button
                        type="button"
                        onClick={() => {
                          toggleFriend(f.userId);
                          setFriendPickerOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm hover:bg-raised"
                      >
                        <ProfileAvatar name={f.displayName} src={f.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{f.displayName}</span>
                          <span className="ml-1 text-xs text-dim">@{f.username}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Field>

        <button
          type="button"
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-[9px] border border-line py-2.5 text-[13px] font-semibold text-dim hover:bg-bg"
          onClick={() => refreshFromAniList(entry.id)}
          disabled={refreshingId === entry.id}
        >
          <RefreshCw className={`size-4 ${refreshingId === entry.id ? "animate-spin" : ""}`} />
          {refreshingId === entry.id ? "Mise à jour…" : "Mettre à jour les infos AniList"}
        </button>

        {confirming ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-[9px] border border-crimson py-2.5 text-[13px] font-semibold text-crimson hover:bg-crimson/10"
              onClick={() => removeEntry(entry.id)}
            >
              <Trash2 className="size-4" />
              Confirmer la suppression
            </button>
            <button
              type="button"
              className="rounded-[9px] border border-line px-3 text-[13px] font-semibold text-dim"
              onClick={() => setConfirming(false)}
            >
              Non
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[9px] border border-crimson py-2.5 text-[13px] font-semibold text-crimson hover:bg-crimson/10"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
            Retirer de la watchlist
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11.5px] font-semibold text-dim">{label}</label>
      {children}
    </div>
  );
}
