import type { WatchlistEntry } from "@/lib/watchlist";

const PREFS_KEY = "tsuzuku:airing-reminders";
const NOTIFIED_KEY = "tsuzuku:airing-notified";

export type ReminderPrefs = {
  enabled: boolean;
  /** Minutes before airing to notify (default 60) */
  minutesBefore: number;
};

const DEFAULT_PREFS: ReminderPrefs = {
  enabled: false,
  minutesBefore: 60,
};

export function loadReminderPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      enabled: Boolean(p.enabled),
      minutesBefore:
        typeof p.minutesBefore === "number" && p.minutesBefore >= 0
          ? p.minutesBefore
          : DEFAULT_PREFS.minutesBefore,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveReminderPrefs(prefs: ReminderPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function notifiedMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function markNotified(key: string) {
  const map = notifiedMap();
  map[key] = Date.now();
  // prune old (> 14 days)
  const cutoff = Date.now() - 14 * 86400_000;
  for (const k of Object.keys(map)) {
    if (map[k]! < cutoff) delete map[k];
  }
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

function alreadyNotified(key: string) {
  return Boolean(notifiedMap()[key]);
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

function notify(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/**
 * Scan watching entries and fire browser notifications for episodes
 * within the reminder window. Safe to call every minute.
 */
export function checkAiringReminders(entries: WatchlistEntry[]) {
  const prefs = loadReminderPrefs();
  if (!prefs.enabled) return;
  if (notificationPermission() !== "granted") return;

  const now = Math.floor(Date.now() / 1000);
  const windowSec = prefs.minutesBefore * 60;

  for (const e of entries) {
    if (e.status !== "Watching" || !e.nextAiring) continue;
    const at = e.nextAiring.airingAt;
    const ep = e.nextAiring.episode;
    if (at <= 0 || ep <= 0) continue;

    const key = `${e.anilistId}:${ep}:${at}`;
    if (alreadyNotified(key)) continue;

    const delta = at - now;
    // Notify when within [0, minutesBefore] OR up to 15 min past airing
    if (delta <= windowSec && delta >= -15 * 60) {
      const when =
        delta <= 0
          ? "maintenant"
          : delta < 3600
            ? `dans ${Math.max(1, Math.round(delta / 60))} min`
            : `dans ${Math.round(delta / 3600)} h`;
      notify(
        `Ép. ${ep} · ${e.title}`,
        delta <= 0 ? "L'épisode est disponible." : `Sortie prévue ${when}.`,
        key,
      );
      markNotified(key);
    }
  }
}
