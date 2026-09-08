import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getStoredTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

const YT_ID = "beINamVRGy4";
const VOL_KEY = "tsuzuku:pride-music-volume";
const MUTE_KEY = "tsuzuku:pride-music-muted";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState?: { ENDED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (n: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
  seekTo: (seconds: number, allowSeek: boolean) => void;
  getCurrentTime: () => number;
};

type PrideAudioState = {
  volume: number; // 0-100
  muted: boolean;
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function loadVol(): number {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  } catch {
    /* */
  }
  return 40;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return true;
  }
}

/** Singleton player — survives route changes / React remounts. */
const singleton: {
  player: YtPlayer | null;
  host: HTMLDivElement | null;
  apiReady: boolean;
  desired: PrideAudioState;
  themeActive: boolean;
  started: boolean;
} = {
  player: null,
  host: null,
  apiReady: false,
  desired: { volume: 40, muted: true },
  themeActive: false,
  started: false,
};

function applyPlayerAudio() {
  const p = singleton.player;
  if (!p) return;
  try {
    p.setVolume(singleton.desired.volume);
    if (singleton.desired.muted || singleton.desired.volume <= 0) p.mute();
    else p.unMute();
  } catch {
    /* */
  }
}

function ensureHost() {
  if (typeof document === "undefined") return null;
  if (singleton.host && document.body.contains(singleton.host)) return singleton.host;
  const host = document.createElement("div");
  host.id = "tsuzuku-pride-yt-host";
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    left: "-9999px",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
    overflow: "hidden",
  });
  const inner = document.createElement("div");
  inner.id = "tsuzuku-pride-yt-player";
  host.appendChild(inner);
  document.body.appendChild(host);
  singleton.host = host;
  return host;
}

function createPlayer() {
  if (!window.YT?.Player) return;
  if (singleton.player) return;
  ensureHost();
  const el = document.getElementById("tsuzuku-pride-yt-player");
  if (!el) return;

  singleton.player = new window.YT.Player(el, {
    videoId: YT_ID,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      loop: 1,
      playlist: YT_ID,
    },
    events: {
      onReady: (e) => {
        singleton.player = e.target;
        applyPlayerAudio();
        if (singleton.themeActive) {
          try {
            e.target.playVideo();
            singleton.started = true;
          } catch {
            /* */
          }
        }
        notify();
      },
      onStateChange: (e) => {
        // Loop fallback if playlist param ignored
        if (e.data === window.YT?.PlayerState?.ENDED) {
          try {
            e.target.seekTo(0, true);
            e.target.playVideo();
          } catch {
            /* */
          }
        }
      },
    },
  });
}

function loadYoutubeApi() {
  if (typeof window === "undefined") return;
  if (window.YT?.Player) {
    singleton.apiReady = true;
    createPlayer();
    return;
  }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    singleton.apiReady = true;
    createPlayer();
  };
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  }
}

function setThemeActive(active: boolean) {
  singleton.themeActive = active;
  if (active) {
    loadYoutubeApi();
    createPlayer();
    try {
      singleton.player?.playVideo();
      singleton.started = true;
    } catch {
      /* */
    }
    applyPlayerAudio();
  } else {
    try {
      singleton.player?.pauseVideo();
    } catch {
      /* */
    }
  }
  notify();
}

function setDesired(partial: Partial<PrideAudioState>) {
  singleton.desired = { ...singleton.desired, ...partial };
  try {
    localStorage.setItem(VOL_KEY, String(singleton.desired.volume));
    localStorage.setItem(MUTE_KEY, singleton.desired.muted ? "1" : "0");
  } catch {
    /* */
  }
  applyPlayerAudio();
  if (singleton.themeActive && !singleton.desired.muted && singleton.desired.volume > 0) {
    try {
      singleton.player?.playVideo();
      singleton.player?.unMute();
    } catch {
      /* */
    }
  }
  notify();
}

function usePrideTheme(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => {
      const t = (document.documentElement.getAttribute("data-theme") as ThemeId) || getStoredTheme();
      const on = t === "pride";
      setActive(on);
      setThemeActive(on);
    };
    sync();
    singleton.desired = { volume: loadVol(), muted: loadMuted() };
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
      // Do NOT destroy the player on unmount — keeps music across navigations
    };
  }, []);
  return active;
}

function usePrideAudioState(): PrideAudioState {
  const [state, setState] = useState<PrideAudioState>(() => ({
    volume: loadVol(),
    muted: loadMuted(),
  }));
  useEffect(() => {
    const sync = () => setState({ ...singleton.desired });
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return state;
}

/**
 * Bootstraps the singleton YouTube player (no UI).
 * Safe to mount once in the app shell.
 */
export function PrideMusic() {
  usePrideTheme();
  return null;
}

/** Controls for the footer — far right, only when Pride theme is active. */
export function PrideMusicControls({ className }: { className?: string }) {
  const active = usePrideTheme();
  const { volume, muted } = usePrideAudioState();

  if (!active) return null;

  return (
    <div
      className={cn(
        "ml-auto flex shrink-0 items-center gap-2 rounded-full border border-line/80 bg-raised/90 px-2.5 py-1.5 shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          const nextMuted = !muted;
          setDesired({ muted: nextMuted });
          if (!nextMuted) {
            try {
              singleton.player?.playVideo();
              singleton.player?.unMute();
            } catch {
              /* */
            }
          }
        }}
        className="rounded-full p-1 text-dim hover:text-lime"
        title={muted ? "Activer la musique" : "Couper le son"}
        aria-label={muted ? "Activer la musique Pride" : "Couper la musique Pride"}
      >
        {muted || volume <= 0 ? (
          <VolumeX className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5 text-lime" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDesired({ volume: v, muted: v <= 0 });
          if (v > 0) {
            try {
              singleton.player?.playVideo();
              singleton.player?.unMute();
            } catch {
              /* */
            }
          }
        }}
        className="h-1 w-20 cursor-pointer accent-[var(--color-lime)] sm:w-28"
        aria-label="Volume musique Pride"
        title={`Volume ${muted ? 0 : volume}%`}
      />
      <span className="hidden min-[400px]:inline text-[10.5px] font-semibold tabular-nums text-dim">
        {muted ? 0 : volume}%
      </span>
    </div>
  );
}
