/** Local watch habits: daily episode log, weekly goal, streak, monthly summary. */

export type DailyWatchLog = {
  /** YYYY-MM-DD in local timezone */
  date: string;
  episodes: number;
};

export type HabitsState = {
  weeklyGoal: number;
  log: DailyWatchLog[];
};

const DEFAULT_GOAL = 7;

function storageKey(userId: string | null | undefined) {
  return `tsuzuku:habits:${userId || "local"}`;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function loadHabits(userId?: string | null): HabitsState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { weeklyGoal: DEFAULT_GOAL, log: [] };
    const p = JSON.parse(raw) as Partial<HabitsState>;
    return {
      weeklyGoal:
        typeof p.weeklyGoal === "number" && p.weeklyGoal > 0
          ? Math.min(100, Math.round(p.weeklyGoal))
          : DEFAULT_GOAL,
      log: Array.isArray(p.log)
        ? p.log
            .filter(
              (x) =>
                x &&
                typeof x.date === "string" &&
                typeof x.episodes === "number" &&
                x.episodes > 0,
            )
            .map((x) => ({ date: x.date, episodes: Math.round(x.episodes) }))
        : [],
    };
  } catch {
    return { weeklyGoal: DEFAULT_GOAL, log: [] };
  }
}

export function saveHabits(userId: string | null | undefined, state: HabitsState) {
  try {
    // Keep ~1 year of daily logs
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffKey = todayKey(cutoff);
    const log = state.log.filter((x) => x.date >= cutoffKey).slice(-400);
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ weeklyGoal: state.weeklyGoal, log }),
    );
  } catch {
    /* */
  }
}

/** Record N episodes watched today (call when progress increases). */
export function recordEpisodesWatched(
  userId: string | null | undefined,
  count: number,
) {
  if (!count || count <= 0) return;
  const state = loadHabits(userId);
  const key = todayKey();
  const existing = state.log.find((x) => x.date === key);
  if (existing) existing.episodes += count;
  else state.log.push({ date: key, episodes: count });
  saveHabits(userId, state);
}

export function setWeeklyGoal(userId: string | null | undefined, goal: number) {
  const state = loadHabits(userId);
  state.weeklyGoal = Math.max(1, Math.min(100, Math.round(goal)));
  saveHabits(userId, state);
  return state.weeklyGoal;
}

function parseDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Monday-start week keys containing `ref`. */
export function weekDateKeys(ref = new Date()): string[] {
  const s = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = s.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  s.setDate(s.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(s);
    x.setDate(s.getDate() + i);
    return todayKey(x);
  });
}

export function episodesInWeek(state: HabitsState, ref = new Date()) {
  const keys = new Set(weekDateKeys(ref));
  return state.log.filter((x) => keys.has(x.date)).reduce((s, x) => s + x.episodes, 0);
}

/**
 * Consecutive days ending today (or yesterday if nothing today yet)
 * with at least 1 episode logged.
 */
export function computeStreak(state: HabitsState, ref = new Date()): number {
  const byDate = new Map(state.log.map((x) => [x.date, x.episodes]));
  let cursor = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  // If today empty, streak can still count through yesterday
  if (!byDate.get(todayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const key = todayKey(cursor);
    const n = byDate.get(key) || 0;
    if (n <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function monthSummary(
  state: HabitsState,
  entries: { status: string; rating: number | null; updatedAt: string; progress: number }[],
  ref = new Date(),
) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
  const episodesThisMonth = state.log
    .filter((x) => x.date.startsWith(prefix))
    .reduce((s, x) => s + x.episodes, 0);

  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  const completedThisMonth = entries.filter((e) => {
    if (e.status !== "Completed") return false;
    const t = Date.parse(e.updatedAt);
    return t >= start && t < end;
  }).length;

  const ratedThisMonth = entries.filter((e) => {
    if (e.rating == null) return false;
    const t = Date.parse(e.updatedAt);
    return t >= start && t < end;
  });
  const avgRating =
    ratedThisMonth.length === 0
      ? null
      : ratedThisMonth.reduce((s, e) => s + (e.rating || 0), 0) / ratedThisMonth.length;

  return {
    episodesThisMonth,
    completedThisMonth,
    ratedCount: ratedThisMonth.length,
    avgRating,
    monthLabel: ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
  };
}

export type HabitsSnapshot = {
  weeklyGoal: number;
  weekEpisodes: number;
  streak: number;
  todayEpisodes: number;
  month: ReturnType<typeof monthSummary>;
};

export function getHabitsSnapshot(
  userId: string | null | undefined,
  entries: { status: string; rating: number | null; updatedAt: string; progress: number }[],
): HabitsSnapshot {
  const state = loadHabits(userId);
  const today = todayKey();
  return {
    weeklyGoal: state.weeklyGoal,
    weekEpisodes: episodesInWeek(state),
    streak: computeStreak(state),
    todayEpisodes: state.log.find((x) => x.date === today)?.episodes ?? 0,
    month: monthSummary(state, entries),
  };
}
