import { useCallback, useEffect, useState } from "react";
import { Flame, Target, Trophy } from "lucide-react";
import {
  getHabitsSnapshot,
  setWeeklyGoal,
  type HabitsSnapshot,
} from "@/lib/watch-habits";
import { useWatchlistStore } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

export function HabitsCard() {
  const entries = useWatchlistStore((s) => s.entries);
  const userId = useWatchlistStore((s) => s.userId);
  const [snap, setSnap] = useState<HabitsSnapshot | null>(null);

  const refresh = useCallback(() => {
    setSnap(getHabitsSnapshot(userId, entries));
  }, [userId, entries]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Recompute when tab focuses (progress may have changed)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  if (!snap) return null;

  const pct = Math.min(100, Math.round((snap.weekEpisodes / snap.weeklyGoal) * 100));
  const goalReached = snap.weekEpisodes >= snap.weeklyGoal;

  return (
    <section className="mb-7 rounded-[14px] border border-line bg-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif flex items-center gap-2 text-[17px] font-medium">
          <Target className="size-4 text-lime" />
          Objectifs
        </h3>
        <label className="flex items-center gap-1.5 text-[12px] text-dim">
          Objectif / semaine
          <select
            value={snap.weeklyGoal}
            onChange={(e) => {
              setWeeklyGoal(userId, Number(e.target.value));
              refresh();
            }}
            className="rounded-[8px] border border-line bg-bg px-2 py-1 text-[12px] font-semibold text-ink"
          >
            {[3, 5, 7, 10, 14, 21].map((n) => (
              <option key={n} value={n}>
                {n} ép.
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Weekly goal */}
        <div className="rounded-[12px] border border-line bg-bg/60 p-3">
          <div className="text-[11px] font-bold tracking-wide text-dim uppercase">Cette semaine</div>
          <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">
            {snap.weekEpisodes}
            <span className="text-base text-dim"> / {snap.weeklyGoal}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={cn("h-full rounded-full transition-all", goalReached ? "bg-lime" : "bg-[var(--accent,#a3e635)]")}
              style={{ width: `${pct}%`, background: goalReached ? undefined : "var(--color-lime)" }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-dim">
            {goalReached
              ? "Objectif atteint 🎉"
              : `${Math.max(0, snap.weeklyGoal - snap.weekEpisodes)} ép. restants`}
            {snap.todayEpisodes > 0 ? ` · ${snap.todayEpisodes} aujourd’hui` : ""}
          </p>
        </div>

        {/* Streak */}
        <div className="rounded-[12px] border border-line bg-bg/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-dim uppercase">
            <Flame className={cn("size-3.5", snap.streak > 0 ? "text-orange-400" : "text-dim")} />
            Série
          </div>
          <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">
            {snap.streak}
            <span className="text-base text-dim"> jour{snap.streak === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-dim">
            {snap.streak === 0
              ? "Logue un épisode pour démarrer"
              : snap.streak >= 7
                ? "Belle régularité !"
                : "Continue demain pour prolonger"}
          </p>
        </div>

        {/* Month */}
        <div className="rounded-[12px] border border-line bg-bg/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-dim uppercase">
            <Trophy className="size-3.5 text-lime" />
            {snap.month.monthLabel}
          </div>
          <div className="mt-2 space-y-1 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <span className="text-dim">Épisodes</span>
              <span className="font-semibold tabular-nums">{snap.month.episodesThisMonth}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-dim">Terminés</span>
              <span className="font-semibold tabular-nums">{snap.month.completedThisMonth}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-dim">Note moy.</span>
              <span className="font-semibold tabular-nums">
                {snap.month.avgRating == null ? "—" : snap.month.avgRating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
