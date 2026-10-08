import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampVolume,
  defaultSkipCues,
  nextRate,
  SIMULATED_EPISODE_SECONDS,
  type PlaybackRate,
  type SkipCue,
} from "@/lib/player";

/**
 * Playback engine.
 *
 * No source is wired yet, so this is a **simulated** transport: a
 * `requestAnimationFrame` clock that advances at the current rate and drives the
 * same state a real one would. That keeps the whole UI — controls, seek bar,
 * keyboard, skip cues, progress — real and testable today, and swapping in a real
 * source later means replacing this file's clock with a `<video>` element's
 * `timeupdate`/`play`/`pause` events behind the same interface. Nothing in the UI
 * components reaches for the internals.
 */

export type PlaybackState = {
  playing: boolean;
  current: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: PlaybackRate;
  /** Distinct from `muted`: remembers the level to restore on unmute. */
  volumeBeforeMute: number;
  ended: boolean;
};

export type Engine = PlaybackState & {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setRate: (rate: PlaybackRate) => void;
  stepRate: (direction: 1 | -1) => void;
  setVolume: (v: number) => void;
  stepVolume: (direction: 1 | -1) => void;
  toggleMute: () => void;
  reset: (episodeNumber: number, duration?: number) => void;
  /**
   * The live transport state, readable without re-rendering.
   *
   * `Engine` itself is a fresh object on every frame (it spreads the ticking
   * clock), so it is useless as an effect dependency: listing it re-arms timers
   * 60 times a second. Effects that need to *read* the transport without
   * depending on it use this instead — it is stable for the hook's lifetime.
   */
  getState: () => PlaybackState;
};

const PREFERENCES_KEY = "tsuzuku:player-prefs";

type Prefs = { volume: number; muted: boolean; rate: PlaybackRate };

function readPrefs(): Prefs {
  const fallback: Prefs = { volume: 1, muted: false, rate: 1 };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      volume: typeof parsed.volume === "number" ? clampVolume(parsed.volume) : fallback.volume,
      muted: Boolean(parsed.muted),
      rate: (typeof parsed.rate === "number" ? parsed.rate : 1) as PlaybackRate,
    };
  } catch {
    return fallback;
  }
}

function writePrefs(prefs: Prefs) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    /* preferences are a nicety, never a failure */
  }
}

export function usePlayerEngine(duration = SIMULATED_EPISODE_SECONDS): Engine {
  const initial = readPrefs();
  const [state, setState] = useState<PlaybackState>({
    playing: false,
    current: 0,
    duration,
    volume: initial.volume,
    muted: initial.muted,
    rate: initial.rate,
    volumeBeforeMute: initial.volume,
    ended: false,
  });

  // The clock reads the latest state through a ref so the rAF loop never closes
  // over a stale copy and keeps ticking at the old rate after a change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const stopClock = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    lastTsRef.current = null;
  }, []);

  const tick = useCallback(
    (ts: number) => {
      const s = stateRef.current;
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (s.playing && last != null) {
        const delta = ((ts - last) / 1000) * s.rate;
        if (delta > 0) {
          const next = s.current + delta;
          if (next >= s.duration) {
            setState({ ...s, current: s.duration, playing: false, ended: true });
            stopClock();
            return;
          }
          setState({ ...s, current: next });
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    },
    [stopClock],
  );

  useEffect(() => {
    if (state.playing) {
      lastTsRef.current = null;
      frameRef.current = requestAnimationFrame(tick);
      return stopClock;
    }
    stopClock();
    return undefined;
  }, [state.playing, tick, stopClock]);

  // React to a duration change instead of relying on the caller to `reset()`.
  // The episode list arrives after the first render, so the engine is built with
  // a zero duration and `useState` would keep it: the timeline then read "0:00 /
  // 0:00" while the episode was known. Never touches `current`, so an in-flight
  // playback is not restarted when the duration is corrected.
  useEffect(() => {
    setState((s) => (s.duration === duration ? s : { ...s, duration }));
  }, [duration]);

  // Cancel on unmount: a leaked rAF loop would keep a component that is gone
  // calling setState.
  useEffect(() => stopClock, [stopClock]);

  const play = useCallback(() => {
    setState((s) => {
      if (s.ended || s.current >= s.duration) return { ...s, current: 0, playing: true, ended: false };
      return { ...s, playing: true };
    });
  }, []);

  const pause = useCallback(() => setState((s) => ({ ...s, playing: false })), []);

  const togglePlay = useCallback(() => {
    setState((s) => (s.playing ? { ...s, playing: false } : s.ended || s.current >= s.duration
      ? { ...s, current: 0, playing: true, ended: false }
      : { ...s, playing: true }));
  }, []);

  const seek = useCallback((seconds: number) => {
    setState((s) => {
      const current = Math.min(s.duration, Math.max(0, seconds));
      return { ...s, current, ended: current >= s.duration };
    });
  }, []);

  const seekBy = useCallback((delta: number) => {
    setState((s) => {
      const current = Math.min(s.duration, Math.max(0, s.current + delta));
      return { ...s, current, ended: current >= s.duration };
    });
  }, []);

  const setRate = useCallback((rate: PlaybackRate) => {
    setState((s) => {
      writePrefs({ volume: s.volume, muted: s.muted, rate });
      return { ...s, rate };
    });
  }, []);

  const stepRate = useCallback((direction: 1 | -1) => {
    setState((s) => {
      const rate = nextRate(s.rate, direction);
      writePrefs({ volume: s.volume, muted: s.muted, rate });
      return { ...s, rate };
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    setState((s) => {
      const volume = clampVolume(v);
      writePrefs({ volume, muted: s.muted, rate: s.rate });
      // Dragging the slider up out of a muted state should unmute, the way every
      // player does.
      return { ...s, volume, muted: volume === 0 ? true : s.muted && volume > 0 ? false : s.muted };
    });
  }, []);

  const stepVolume = useCallback((direction: 1 | -1) => {
    setState((s) => {
      const volume = Math.min(1, Math.max(0, Math.round((s.volume + 0.1 * direction) * 10) / 10));
      writePrefs({ volume, muted: volume === 0 ? true : false, rate: s.rate });
      return { ...s, volume, muted: volume === 0 };
    });
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const muted = !s.muted;
      writePrefs({ volume: s.volume, muted, rate: s.rate });
      return muted
        ? { ...s, muted: true, volumeBeforeMute: s.volume > 0 ? s.volume : s.volumeBeforeMute }
        : { ...s, muted: false, volume: s.volume > 0 ? s.volume : s.volumeBeforeMute };
    });
  }, []);

  /** Called when the viewer switches episode: rewind, keep preferences. */
  const reset = useCallback((_episodeNumber: number, nextDuration = duration) => {
    setState((s) => ({ ...s, current: 0, duration: nextDuration, playing: false, ended: false }));
  }, [duration]);

  // Stable for the hook's lifetime: effects can read the transport through it
  // without depending on the per-frame `Engine` object.
  const getState = useCallback(() => stateRef.current, []);

  return {
    ...state,
    play,
    pause,
    togglePlay,
    seek,
    seekBy,
    setRate,
    stepRate,
    setVolume,
    stepVolume,
    toggleMute,
    reset,
    getState,
  };
}

/** Intro/ending cues for the current episode, recomputed when it changes. */
export function useSkipCues(duration: number): SkipCue[] {
  return defaultSkipCues(duration);
}