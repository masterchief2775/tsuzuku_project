/**
 * Player logic — pure, no DOM.
 *
 * Everything the player UI needs that is not a direct video-element call:
 * clock formatting, rate/volume stepping, episode maths, resume rules, keyboard
 * shortcut mapping and skip cues. Kept out of the components so it can be tested
 * without a browser, and so the eventual real source only has to satisfy
 * `use-player-engine.ts`.
 */

export const SKIP_STEP_SECONDS = 10;
/** How far the ±10s keys and the seek bar's arrow keys jump. */
export const SEEK_STEP_SECONDS = 5;
/** Volume step per key press, 0..1. */
export const VOLUME_STEP = 0.1;

/**
 * Nominal episode length used by the simulated engine (see
 * `use-player-engine.ts`). No real source is wired yet, so there is no measured
 * duration; 24 min is the standard TV slot and keeps the UI honest about it.
 */
export const SIMULATED_EPISODE_SECONDS = 24 * 60;

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** "1:02:03" over an hour, "12:34" below, "0:00" for nonsense input. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "-12:34" for the seek readout, so the direction is readable at a glance. */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  return `${sign}${formatClock(Math.abs(seconds))}`;
}

/** "-4 min" next to a projected end, the same wording the timeline uses. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "terminé";
  const m = Math.round(seconds / 60);
  if (m < 60) return `−${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `−${h} h` : `−${h} h ${rest} min`;
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function nextVolume(volume: number, direction: 1 | -1): number {
  // Clamp and snap to the step grid BEFORE stepping. `NaN + 0.1` is still NaN,
  // so a corrupt stored volume would pin the control at 0 forever; and a stored
  // 0.15 has to become 0.2 rather than 0.05, or the control drifts off the tenth
  // it started on.
  const base = Math.round(clampVolume(volume) * 10) / 10;
  const next = base + VOLUME_STEP * direction;
  // Snap to 0/1 so repeated presses cannot leave it at 0.9 / 0.1.
  return Math.min(1, Math.max(0, Math.round(next * 10) / 10));
}

export function nextRate(rate: number, direction: 1 | -1): PlaybackRate {
  const i = PLAYBACK_RATES.indexOf(rate as PlaybackRate);
  const at = i === -1 ? PLAYBACK_RATES.indexOf(1) : i;
  const next = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, at + direction));
  return PLAYBACK_RATES[next]!;
}

export type Episode = {
  number: number;
  title: string;
  /** Seconds; the simulated engine's nominal length until a real source lands. */
  duration: number;
};

/** "Ép. 1", "Ép. 12", "Épilogue", "SP" — how streaming sites label a row. */
export function episodeNumberLabel(n: number): string {
  if (n === 0) return "SP";
  if (n === -1) return "PV";
  if (n > 1000) return `Ép. ${n}`;
  return `Ép. ${n}`;
}

export function buildEpisodes(count: number, duration = SIMULATED_EPISODE_SECONDS): Episode[] {
  const total = Math.max(0, Math.floor(count));
  return Array.from({ length: total }, (_, i) => ({
    number: i + 1,
    title: `Épisode ${i + 1}`,
    duration,
  }));
}

export function findEpisode(episodes: Episode[], number: number): Episode | null {
  return episodes.find((e) => e.number === number) ?? null;
}

/** Next episode number, or null at the end (the caller shows "fin de la série"). */
export function nextEpisodeNumber(episodes: Episode[], current: number): number | null {
  const ordered = [...episodes].sort((a, b) => a.number - b.number);
  const i = ordered.findIndex((e) => e.number === current);
  if (i === -1) return ordered[0]?.number ?? null;
  return ordered[i + 1]?.number ?? null;
}

export function previousEpisodeNumber(episodes: Episode[], current: number): number | null {
  const ordered = [...episodes].sort((a, b) => a.number - b.number);
  const i = ordered.findIndex((e) => e.number === current);
  if (i === -1) return ordered[ordered.length - 1]?.number ?? null;
  return ordered[i - 1]?.number ?? null;
}

/**
 * Where to resume, or null.
 *
 * Below `minSeconds` we start over: relaunching into the last 20s of an episode
 * is not resuming. Past `freshness` (95%) the episode is effectively finished,
 * so it restarts too rather than dropping the viewer one second before the end.
 */
export function resumePosition(
  savedSeconds: number | null | undefined,
  durationSeconds: number | null,
  minSeconds = 30,
  freshness = 0.95,
): number | null {
  if (savedSeconds == null || !Number.isFinite(savedSeconds)) return null;
  if (savedSeconds < minSeconds) return null;
  if (durationSeconds != null && durationSeconds > 0 && savedSeconds / durationSeconds >= freshness) return null;
  return savedSeconds;
}

export function progressRatio(current: number, duration: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, current / duration));
}

export function progressPercent(current: number, duration: number): number {
  return Math.round(progressRatio(current, duration) * 100);
}

export type PlayerAction =
  | "toggle-play"
  | "seek-back"
  | "seek-forward"
  | "volume-up"
  | "volume-down"
  | "toggle-mute"
  | "toggle-fullscreen"
  | "rate-faster"
  | "rate-slower"
  | "reset-rate"
  | "next-episode"
  | "previous-episode"
  | "jump-start"
  | "close";

/**
 * Keyboard map. Deliberately not a full shortcut table in the UI yet: these are
 * the keys a streaming site is expected to answer to, and each one is exercised
 * by the shortcut legend in the player.
 */
export function shortcutForKey(key: string): PlayerAction | null {
  switch (key) {
    case " ":
    case "k":
    case "K":
      return "toggle-play";
    case "j":
    case "J":
    case "ArrowLeft":
      return "seek-back";
    case "l":
    case "L":
    case "ArrowRight":
      return "seek-forward";
    case "ArrowUp":
      return "volume-up";
    case "ArrowDown":
      return "volume-down";
    case "m":
    case "M":
      return "toggle-mute";
    case "f":
    case "F":
      return "toggle-fullscreen";
    case ">":
    case ".":
      return "rate-faster";
    case "<":
    case ",":
      return "rate-slower";
    case "0":
      return "reset-rate";
    case "n":
    case "N":
      return "next-episode";
    case "p":
    case "P":
      return "previous-episode";
    case "Home":
      return "jump-start";
    case "Escape":
      return "close";
    default:
      return null;
  }
}

/** "0-9" jumps to a percentage of the episode, the way every player does it. */
export function percentFromDigit(digit: string): number | null {
  if (!/^[0-9]$/.test(digit)) return null;
  return Number(digit) * 10;
}

export type SkipCueKind = "intro" | "ending";

export type SkipCue = {
  kind: SkipCueKind;
  start: number;
  end: number;
};

/**
 * Intro/ending skip ranges for the simulated engine. Real ranges come from the
 * source later; these sit at the conventional places (90s in, last 90s).
 */
export function defaultSkipCues(duration = SIMULATED_EPISODE_SECONDS): SkipCue[] {
  return [
    { kind: "intro", start: 0, end: Math.min(90, duration * 0.1) },
    { kind: "ending", start: Math.max(0, duration - 90), end: duration },
  ];
}

/** The cue covering `time`, if any. A 0-length cue never fires. */
export function activeSkipCue(cues: SkipCue[], time: number): SkipCue | null {
  return cues.find((c) => c.end > c.start && time >= c.start && time < c.end) ?? null;
}

export function skipCueLabel(cue: SkipCue): string {
  return cue.kind === "intro" ? "Passer l'intro" : "Passer le générique";
}

/**
 * Does this moment count as "watched"?
 *
 * The sim engine and a real source both feed progress in; 90% is the point where
 * a viewer has effectively seen the episode, which is what advances the watchlist.
 */
export const WATCHED_THRESHOLD = 0.9;

export function hasWatched(current: number, duration: number, threshold = WATCHED_THRESHOLD): boolean {
  return progressRatio(current, duration) >= threshold;
}