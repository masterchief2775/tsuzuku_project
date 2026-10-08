import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activeSkipCue,
  hasWatched,
  nextEpisodeNumber,
  previousEpisodeNumber,
  resumePosition,
  shortcutForKey,
  type Episode,
} from "@/lib/player";
import { usePlayerEngine, useSkipCues } from "@/components/tsuzuku/use-player-engine";
import { useWatchlistStore } from "@/store/watchlist-store";

/**
 * Player state for the watch page: which episode is loaded, where to resume it,
 * and how to move between episodes.
 *
 * Position is saved per (anilistId, episode) so switching back and forth behaves
 * like a real streaming site, and advancing an episode past the watched threshold
 * advances the watchlist entry — the app's own progress tracking, not a duplicate.
 */

const RESUME_PREFIX = "tsuzuku:player-pos";

export function resumeStorageKey(anilistId: number, episodeNumber: number): string {
  return `${RESUME_PREFIX}:${anilistId}:${episodeNumber}`;
}

export function readResume(anilistId: number, episodeNumber: number): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(resumeStorageKey(anilistId, episodeNumber));
    const n = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeResume(anilistId: number, episodeNumber: number, seconds: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(resumeStorageKey(anilistId, episodeNumber), String(Math.max(0, Math.floor(seconds))));
  } catch {
    /* resume position is a convenience, never a failure */
  }
}

export function useWatchSession(anilistId: number, episodes: Episode[], initialEpisode: number) {
  const [episodeNumber, setEpisodeNumber] = useState(initialEpisode);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const entry = useWatchlistStore((s) => s.entries.find((e) => e.anilistId === anilistId) ?? null);
  const updateEntry = useWatchlistStore((s) => s.updateEntry);

  const episode = useMemo(
    () => episodes.find((e) => e.number === episodeNumber) ?? episodes[0] ?? null,
    [episodes, episodeNumber],
  );

  const engine = usePlayerEngine(episode?.duration ?? 0);
  const cues = useSkipCues(episode?.duration ?? 0);
  // The engine object is rebuilt on every frame (it spreads the ticking clock),
  // so it must never be an effect dependency. Its callbacks are `useCallback`-stable
  // and destructured here so effects can depend on those instead.
  const { seek, reset, getState: readState, current, duration } = engine;

  // Resume once per episode switch, after the engine knows the duration.
  const resumedRef = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the episode: its duration is what `seek` clamps against, and
    // resuming before it is known silently clamps to 0 — and the ref below then
    // blocks the retry, so the saved position was lost on every reload.
    if (!episode) return;
    const key = `${anilistId}:${episodeNumber}`;
    if (resumedRef.current === key) return;
    resumedRef.current = key;
    const at = resumePosition(readResume(anilistId, episodeNumber), episode.duration);
    setResumedFrom(at);
    if (at != null) seek(at);
    else reset(episodeNumber, episode.duration);
  }, [anilistId, episodeNumber, episode, seek, reset]);

  // Persist on a timer, not from a render-driven effect: the engine object is
  // rebuilt every frame, so an effect keyed on it ran 60x a second and reached
  // its 5s threshold only by accident. The cleanup covers leaving the page,
  // where no further tick would ever run.
  useEffect(() => {
    const save = () => {
      const { current: at, duration: total } = readState();
      if (total <= 0 || at <= 0) return;
      writeResume(anilistId, episodeNumber, at);
    };
    const id = window.setInterval(save, 5000);
    return () => {
      window.clearInterval(id);
      save();
    };
  }, [readState, anilistId, episodeNumber]);

  // Advance the watchlist when the episode is actually watched. Deliberately
  // once per episode: without the ref, every render past the threshold would
  // rewrite the entry and push it to the server.
  const creditedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entry || !episode) return;
    if (episodeNumber <= entry.progress) return;
    if (!hasWatched(current, duration)) return;
    const key = `${anilistId}:${episodeNumber}`;
    if (creditedRef.current === key) return;
    creditedRef.current = key;
    // Only the LAST episode completes the series. `updateEntry` treats
    // `status: "Completed"` as "everything watched" and jumps `progress` to the
    // total, so marking the series done after one episode turned "5/170" into
    // "170/170".
    const isLast = episodes.length > 0 && episodeNumber >= episodes.length;
    updateEntry(entry.id, {
      progress: episodeNumber,
      ...(isLast ? { status: "Completed" as const } : { status: "Watching" as const }),
    });
  }, [current, duration, episodeNumber, episodes.length, entry, episode, anilistId, updateEntry]);

  const goTo = useCallback(
    (next: number | null) => {
      if (next == null) return;
      // Save where the viewer was before leaving, read through the stable
      // accessor rather than from a captured render value.
      const { current: leavingAt } = readState();
      if (leavingAt > 0) writeResume(anilistId, episodeNumber, leavingAt);
      setEpisodeNumber(next);
      setResumedFrom(null);
    },
    [anilistId, episodeNumber, readState],
  );

  const next = useMemo(() => nextEpisodeNumber(episodes, episodeNumber), [episodes, episodeNumber]);
  const previous = useMemo(
    () => previousEpisodeNumber(episodes, episodeNumber),
    [episodes, episodeNumber],
  );

  const activeCue = useMemo(() => activeSkipCue(cues, current), [cues, current]);

  /** Applies a keyboard action to the engine, or reports it needs the page. */
  const applyAction = useCallback(
    (action: string): boolean => {
      switch (action) {
        case "toggle-play":
          engine.togglePlay();
          return true;
        case "seek-back":
          engine.seekBy(-10);
          return true;
        case "seek-forward":
          engine.seekBy(10);
          return true;
        case "volume-up":
          engine.stepVolume(1);
          return true;
        case "volume-down":
          engine.stepVolume(-1);
          return true;
        case "toggle-mute":
          engine.toggleMute();
          return true;
        case "rate-faster":
          engine.stepRate(1);
          return true;
        case "rate-slower":
          engine.stepRate(-1);
          return true;
        case "reset-rate":
          engine.setRate(1);
          return true;
        case "jump-start":
          engine.seek(0);
          return true;
        case "next-episode":
          goTo(next);
          return true;
        case "previous-episode":
          goTo(previous);
          return true;
        default:
          return false;
      }
    },
    [engine, goTo, next, previous],
  );

  const skipActiveCue = useCallback(() => {
    if (!activeCue) return;
    engine.seek(activeCue.end);
  }, [activeCue, engine]);

  return {
    episode,
    episodeNumber,
    episodes,
    engine,
    cues,
    activeCue,
    skipActiveCue,
    next,
    previous,
    goTo,
    resumedFrom,
    dismissResume: () => setResumedFrom(null),
    applyAction,
    shortcutForKey,
  };
}