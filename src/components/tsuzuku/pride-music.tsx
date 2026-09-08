import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getStoredTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

const YT_ID = "beINamVRGy4";
const VOL_KEY = "tsuzuku:pride-music-volume";
const MUTE_KEY = "tsuzuku:pride-music-muted";
const TIME_KEY = "tsuzuku:pride-music-time";

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
      PlayerState?: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    __tsuzukuPride?: PrideSingleton;
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
  getPlayerState: () => number;
};

type PrideAudioState = {
  volume: number;
  muted: boolean;
};

type PrideSingleton = {
  player: YtPlayer | null;
  host: HTMLDivElement | null;
  desired: PrideAudioState;
  themeActive: boolean;
  apiLoading: boolean;
  loopTimer: number | null;
  saveTimer: number | null;
  listeners: Set<() => void>;
};

function getSingleton(): PrideSingleton {
  if (typeof window === "undefined") {
    return {
      player: null,
      host: null,
      desired: { volume: 40, muted: true },
      themeActive: false,
      apiLoading: false,
      loopTimer: null,
      saveTimer: null,
      listeners: new Set(),
    };
  }
  if (!window.__tsuzukuPride) {
    window.__tsuzukuPride = {
      player: null,
      host: null,
      desired: { volume: loadVol(), muted: loadMuted() },
      themeActive: false,
      apiLoading: false,
      loopTimer: null,
      saveTimer: null,
      listeners: new Set(),
    };
  }
  return window.__tsuzukuPride;
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
    return localStorage.getItem(MUTE_KEY) !== "0";
  } catch {
    return true;
  }
}

function loadTime(): number {
  try {
    const n = Number(localStorage.getItem(TIME_KEY));
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* */
  }
  return 0;
}

function saveTime(t: number) {
  try {
    localStorage.setItem(TIME_KEY, String(Math.floor(t)));
  } catch {
    /* */
  }
}

function notify() {
  const s = getSingleton();
  for (const l of s.listeners) l();
}

function applyPlayerAudio() {
  const s = getSingleton();
  const p = s.player;
  if (!p) return;
  try {
    p.setVolume(s.desired.volume);
    if (s.desired.muted || s.desired.volume <= 0) p.mute();
    else p.unMute();
  } catch {
    /* */
  }
}

function ensureHost() {
  if (typeof document === "undefined") return null;
  const s = getSingleton();
  if (s.host && document.body.contains(s.host)) return s.host;
  let host = document.getElementById("tsuzuku-pride-yt-host") as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
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
      zIndex: "-1",
    });
    document.body.appendChild(host);
  }
  if (!host.querySelector("#tsuzuku-pride-yt-player")) {
    const inner = document.createElement("div");
    inner.id = "tsuzuku-pride-yt-player";
    host.appendChild(inner);
  }
  s.host = host;
  return host;
}

function restartLoop(p: YtPlayer) {
  try {
    p.seekTo(0, true);
    p.playVideo();
  } catch {
    /* */
  }
}

function startWatchdogs() {
  const s = getSingleton();
  if (s.loopTimer != null) return;

  // Poll player state: keep playing while theme is active + loop on end
  s.loopTimer = window.setInterval(() => {
    const st = getSingleton();
    const p = st.player;
    if (!p || !st.themeActive) return;
    try {
      const state = p.getPlayerState();
      // 0 = ENDED
      if (state === 0 || state === window.YT?.PlayerState?.ENDED) {
        restartLoop(p);
      }
      // Persist position so a rare rebuild can resume
      const t = p.getCurrentTime?.();
      if (typeof t === "number" && t > 1) saveTime(t);
    } catch {
      /* */
    }
  }, 1500);
}

function createPlayer() {
  const s = getSingleton();
  if (!window.YT?.Player) return;
  if (s.player) {
    // Already exists — just ensure playing if needed
    if (s.themeActive) {
      try {
        s.player.playVideo();
        applyPlayerAudio();
      } catch {
        /* */
      }
    }
    return;
  }

  ensureHost();
  const el = document.getElementById("tsuzuku-pride-yt-player");
  if (!el) return;

  s.player = new window.YT.Player(el, {
    videoId: YT_ID,
    playerVars: {
      autoplay: s.themeActive ? 1 : 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      loop: 1,
      playlist: YT_ID, // required for loop
      start: Math.floor(loadTime()) || 0,
    },
    events: {
      onReady: (e) => {
        const st = getSingleton();
        st.player = e.target;
        applyPlayerAudio();
        const resume = loadTime();
        if (resume > 2) {
          try {
            e.target.seekTo(resume, true);
          } catch {
            /* */
          }
        }
        if (st.themeActive) {
          try {
            e.target.playVideo();
          } catch {
            /* */
          }
        }
        startWatchdogs();
        notify();
      },
      onStateChange: (e) => {
        if (e.data === 0 || e.data === window.YT?.PlayerState?.ENDED) {
          restartLoop(e.target);
        }
      },
    },
  });
}

function loadYoutubeApi() {
  if (typeof window === "undefined") return;
  const s = getSingleton();
  if (window.YT?.Player) {
    createPlayer();
    return;
  }
  if (s.apiLoading) return;
  s.apiLoading = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    try {
      prev?.();
    } catch {
      /* */
    }
    createPlayer();
  };
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  }
}

/** Keep theme active flag in sync — never tear down the player. */
export function setPrideThemeActive(active: boolean) {
  const s = getSingleton();
  const was = s.themeActive;
  s.themeActive = active;
  if (active) {
    loadYoutubeApi();
    createPlayer();
    applyPlayerAudio();
    try {
      s.player?.playVideo();
    } catch {
      /* */
    }
    startWatchdogs();
  } else if (was && !active) {
    // Leaving pride: pause but keep player instance for instant resume
    try {
      const t = s.player?.getCurrentTime?.();
      if (typeof t === "number") saveTime(t);
      s.player?.pauseVideo();
    } catch {
      /* */
    }
  }
  notify();
}

function setDesired(partial: Partial<PrideAudioState>) {
  const s = getSingleton();
  s.desired = { ...s.desired, ...partial };
  try {
    localStorage.setItem(VOL_KEY, String(s.desired.volume));
    localStorage.setItem(MUTE_KEY, s.desired.muted ? "1" : "0");
  } catch {
    /* */
  }
  applyPlayerAudio();
  if (s.themeActive && !s.desired.muted && s.desired.volume > 0) {
    try {
      s.player?.playVideo();
      s.player?.unMute();
    } catch {
      /* */
    }
  }
  notify();
}

function readThemeIsPride(): boolean {
  if (typeof document === "undefined") return false;
  const t =
    (document.documentElement.getAttribute("data-theme") as ThemeId) || getStoredTheme();
  return t === "pride";
}

function usePrideThemeFlag(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => {
      const on = readThemeIsPride();
      setActive(on);
      setPrideThemeActive(on);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // Also re-check on visibility (mobile tab switch)
    const onVis = () => {
      if (document.visibilityState === "visible" && readThemeIsPride()) {
        setPrideThemeActive(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      // Important: do NOT pause/destroy on unmount — root stays mounted
    };
  }, []);
  return active;
}

function usePrideAudioState(): PrideAudioState {
  const [state, setState] = useState<PrideAudioState>(() => {
    if (typeof window === "undefined") return { volume: 40, muted: true };
    const s = getSingleton();
    return { ...s.desired };
  });
  useEffect(() => {
    const s = getSingleton();
    const sync = () => setState({ ...s.desired });
    sync();
    s.listeners.add(sync);
    return () => {
      s.listeners.delete(sync);
    };
  }, []);
  return state;
}

/**
 * Mount once at app root. Boots the global YouTube player and keeps it alive
 * across all route changes (home ↔ profile ↔ friends…).
 */
export function PrideMusic() {
  usePrideThemeFlag();
  return null;
}

/** Footer controls — far right, only on Pride theme. */
export function PrideMusicControls({ className }: { className?: string }) {
  const active = usePrideThemeFlag();
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
              getSingleton().player?.playVideo();
              getSingleton().player?.unMute();
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
              getSingleton().player?.playVideo();
              getSingleton().player?.unMute();
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
