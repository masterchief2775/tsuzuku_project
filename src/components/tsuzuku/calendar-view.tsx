import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  addDays,
  formatAiringTime,
  nextAiringText,
  startOfDay,
  upcomingAiring,
  type WatchlistEntry,
} from "@/lib/watchlist";
import {
  checkAiringReminders,
  loadReminderPrefs,
  notificationPermission,
  requestNotificationPermission,
  saveReminderPrefs,
  type ReminderPrefs,
} from "@/lib/airing-reminders";
import { useWatchlistStore } from "@/store/watchlist-store";
import { EmptyState, PageHeader, SectionTitle } from "@/components/tsuzuku/ui";
import { cn } from "@/lib/utils";

/** Local-midnight key (seconds) — same boundary `airingOnDay` groups by. */
function dayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function weekStartMonday(d: Date) {
  const s = startOfDay(d);
  const day = s.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(s, diff);
}

export function CalendarView() {
  const entries = useWatchlistStore((s) => s.entries);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const refreshNextAirings = useWatchlistStore((s) => s.refreshNextAirings);
  const [weekAnchor, setWeekAnchor] = useState(() => weekStartMonday(new Date()));
  const [prefs, setPrefs] = useState<ReminderPrefs>(() =>
    typeof window !== "undefined" ? loadReminderPrefs() : { enabled: false, minutesBefore: 60 },
  );
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" ? notificationPermission() : "unsupported",
  );
  const [refreshing, setRefreshing] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor],
  );

  const upcoming = useMemo(() => upcomingAiring(entries, 28), [entries]);
  const today = startOfDay(new Date());
  // airingOnDay() filters and re-sorts the whole watchlist on every call, and
  // was called 8 times per render (7 day cells + today's count). Bucket once
  // instead — identical result, because upcomingAiring is already sorted.
  const byDay = useMemo(() => {
    const map = new Map<number, WatchlistEntry[]>();
    for (const e of upcomingAiring(entries, 60)) {
      const key = dayKey(new Date(e.nextAiring!.airingAt * 1000));
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [entries]);
  const todayCount = byDay.get(dayKey(today))?.length ?? 0;

  useEffect(() => {
    void refreshNextAirings();
  }, [refreshNextAirings]);

  async function toggleReminders() {
    if (!prefs.enabled) {
      const p = await requestNotificationPermission();
      setPerm(p);
      if (p !== "granted") {
        const next = { ...prefs, enabled: false };
        setPrefs(next);
        saveReminderPrefs(next);
        return;
      }
      const next = { ...prefs, enabled: true };
      setPrefs(next);
      saveReminderPrefs(next);
      checkAiringReminders(entries);
    } else {
      const next = { ...prefs, enabled: false };
      setPrefs(next);
      saveReminderPrefs(next);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshNextAirings();
    } finally {
      setRefreshing(false);
    }
  }

  const weekLabel = (() => {
    const end = addDays(weekAnchor, 6);
    const a = weekAnchor.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const b = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    return `${a} – ${b}`;
  })();

  return (
    <div className="mx-auto max-w-[900px] animate-fade-up">
      <PageHeader
        eyebrow="Diffusions"
        title="Calendrier"
        description={
          <>
            Sorties des titres <strong className="text-ink">en cours</strong> sur ta watchlist.
            {todayCount > 0 ? (
              <>
                {" "}
                <span className="font-semibold text-lime">
                  {todayCount} aujourd&apos;hui
                </span>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-raised px-3 py-2 text-[12.5px] font-semibold text-dim transition hover:border-lime/40 hover:text-ink disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => void toggleReminders()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition",
                prefs.enabled && perm === "granted"
                  ? "border-lime/40 bg-lime/10 text-lime"
                  : "border-line bg-raised text-dim hover:border-lime/40 hover:text-ink",
              )}
            >
              {prefs.enabled && perm === "granted" ? (
                <Bell className="size-3.5" />
              ) : (
                <BellOff className="size-3.5" />
              )}
              {prefs.enabled && perm === "granted" ? "Rappels ON" : "Activer les rappels"}
            </button>
          </>
        }
      />

      {/* Reminder settings */}
      <section className="mb-5 rounded-[14px] border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Rappels navigateur</div>
            <p className="mt-0.5 text-[12.5px] text-dim">
              Notification locale avant la diffusion (onglet ouvert ou PWA).
              {perm === "denied" ? (
                <span className="text-crimson"> Permission refusée dans le navigateur.</span>
              ) : null}
              {perm === "unsupported" ? (
                <span> Non supporté sur cet appareil.</span>
              ) : null}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-dim">
            Prévenir
            <select
              value={prefs.minutesBefore}
              disabled={!prefs.enabled}
              onChange={(e) => {
                const next = { ...prefs, minutesBefore: Number(e.target.value) };
                setPrefs(next);
                saveReminderPrefs(next);
              }}
              className="rounded-[8px] border border-line bg-bg px-2 py-1.5 text-ink disabled:opacity-40"
            >
              <option value={15}>15 min avant</option>
              <option value={30}>30 min avant</option>
              <option value={60}>1 h avant</option>
              <option value={120}>2 h avant</option>
              <option value={0}>À l&apos;heure</option>
            </select>
          </label>
        </div>
      </section>

      {/* Week nav */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekAnchor((w) => addDays(w, -7))}
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold">{weekLabel}</div>
          <button
            type="button"
            className="text-[11.5px] font-semibold text-lime hover:underline"
            onClick={() => setWeekAnchor(weekStartMonday(new Date()))}
          >
            Aujourd&apos;hui
          </button>
        </div>
        <button
          type="button"
          onClick={() => setWeekAnchor((w) => addDays(w, 7))}
          className="rounded-[8px] border border-line bg-raised p-2 text-dim hover:text-ink"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Week grid */}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1.5">
        {days.map((day) => {
          const list = byDay.get(dayKey(day)) ?? [];
          const isToday = sameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[120px] rounded-[12px] border p-2 sm:min-h-[160px]",
                isToday ? "border-lime/50 bg-lime/5" : "border-line bg-raised",
              )}
            >
              <div
                className={cn(
                  "mb-2 text-[11px] font-bold tracking-wide uppercase",
                  isToday ? "text-lime" : "text-dim",
                )}
              >
                {day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-dim">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((e) => (
                    <DayCard key={e.id} entry={e} onOpen={() => setActiveEntryId(e.id)} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Agenda list 14 days */}
      <section>
        <SectionTitle title="Prochaines sorties" />
        {upcoming.length === 0 ? (
          <EmptyState
            title="Aucune diffusion annoncée pour tes titres en cours."
            hint="Passe des animes en « En cours » et actualise."
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => {
              const at = e.nextAiring!.airingAt;
              const label = nextAiringText(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setActiveEntryId(e.id)}
                    className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-raised px-3 py-2.5 text-left transition hover:border-lime/35"
                  >
                    {e.image ? (
                      <img src={e.image} alt="" loading="lazy" decoding="async" className="h-12 w-9 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-9 rounded bg-line" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{e.title}</div>
                      <div className="mt-0.5 text-[12px] text-dim">
                        Ép. {e.nextAiring!.episode} · {formatAiringTime(at, { withDay: true })}
                      </div>
                    </div>
                    {label ? (
                      <span className="shrink-0 rounded-full bg-lime/15 px-2.5 py-1 text-[11px] font-bold text-lime">
                        {label}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DayCard({ entry, onOpen }: { entry: WatchlistEntry; onOpen: () => void }) {
  const at = entry.nextAiring!.airingAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-line/80 bg-bg px-1.5 py-1.5 text-left hover:border-lime/40"
    >
      <div className="line-clamp-2 text-[11px] font-semibold leading-snug">{entry.title}</div>
      <div className="mt-0.5 text-[10px] font-bold text-lime">
        Ép.{entry.nextAiring!.episode} · {formatAiringTime(at)}
      </div>
    </button>
  );
}
