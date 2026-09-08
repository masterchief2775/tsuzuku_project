import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getStoredTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Themed background media (Pride = audio only, Lagtrain = visible MV + audio).
 * Singleton survives route changes. Mount <ThemeMediaBootstrap /> once in root.
 */

type MediaMode = "audio" | "video";

type ThemeMediaConfig = {
  videoId: string;
  mode: MediaMode;
};

const THEME_MEDIA: Partial<Record<ThemeId, ThemeMediaConfig>> = {
  pride: { videoId: "beINamVRGy4", mode: "audio" },
  lagtrain: { videoId: "UnIhRpIT7nc", mode: "video" },
  "lost-umbrella": { videoId: "DeKLpgzh-qQ", mode: "video" },
};

const THEME_MEDIA_LABEL: Partial<Record<ThemeId, string>> = {
  pride: "Pride",
  lagtrain: "Lagtrain",
  "lost-umbrella": "Lost Umbrella",
};

const VOL_KEY = "tsuzuku:theme-media-volume";
const MUTE_KEY = "tsuzuku:theme-media-muted";
const TIME_KEY = "tsuzuku:theme-media-time";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState?: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    __tsuzukuThemeMedia?: ThemeMediaSingleton;
  }
}

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (n: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
  seekTo: (seconds: number, allowSeek: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
};

type AudioState = { volume: number; muted: boolean };

type ThemeMediaSingleton = {
  player: YtPlayer | null;
  host: HTMLDivElement | null;
  desired: AudioState;
  activeTheme: ThemeId | null;
  currentVideoId: string | null;
  apiLoading: boolean;
  loopTimer: number | null;
  listeners: Set<() => void>;
};

function loadVol(): number {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  } catch {
    /* */
  }
  return 35;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== "0";
  } catch {
    return true;
  }
}

function loadTime(videoId: string): number {
  try {
    const raw = localStorage.getItem(TIME_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    const n = map[videoId];
    return typeof n === "number" && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveTime(videoId: string, t: number) {
  try {
    const raw = localStorage.getItem(TIME_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[videoId] = Math.floor(t);
    localStorage.setItem(TIME_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}

function getSingleton(): ThemeMediaSingleton {
  if (typeof window === "undefined") {
    return {
      player: null,
      host: null,
      desired: { volume: 35, muted: true },
      activeTheme: null,
      currentVideoId: null,
      apiLoading: false,
      loopTimer: null,
      listeners: new Set(),
    };
  }
  if (!window.__tsuzukuThemeMedia) {
    window.__tsuzukuThemeMedia = {
      player: null,
      host: null,
      desired: { volume: loadVol(), muted: loadMuted() },
      activeTheme: null,
      currentVideoId: null,
      apiLoading: false,
      loopTimer: null,
      listeners: new Set(),
    };
  }
  return window.__tsuzukuThemeMedia;
}

function notify() {
  for (const l of getSingleton().listeners) l();
}

function applyAudio() {
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

function applyHostMode(mode: MediaMode | null) {
  const s = getSingleton();
  const host = s.host;
  if (!host) return;
  if (mode === "video") {
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      opacity: "1",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "0",
    });
    const iframe = host.querySelector("iframe");
    if (iframe) {
      Object.assign((iframe as HTMLElement).style, {
        position: "absolute",
        width: "100vw",
        height: "56.25vw",
        minHeight: "100vh",
        minWidth: "177.77vh",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        border: "0",
        pointerEvents: "none",
      });
    }
  } else {
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
  }
}

function ensureHost() {
  if (typeof document === "undefined") return null;
  const s = getSingleton();
  if (s.host && document.body.contains(s.host)) return s.host;
  let host = document.getElementById("tsuzuku-theme-media-host") as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = "tsuzuku-theme-media-host";
    host.setAttribute("aria-hidden", "true");
    document.body.insertBefore(host, document.body.firstChild);
  }
  if (!host.querySelector("#tsuzuku-theme-media-player")) {
    const inner = document.createElement("div");
    inner.id = "tsuzuku-theme-media-player";
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
  s.loopTimer = window.setInterval(() => {
    const st = getSingleton();
    const p = st.player;
    if (!p || !st.activeTheme || !THEME_MEDIA[st.activeTheme]) return;
    try {
      const state = p.getPlayerState();
      if (state === 0 || state === window.YT?.PlayerState?.ENDED) {
        restartLoop(p);
      }
      if (st.currentVideoId) {
        const t = p.getCurrentTime?.();
        if (typeof t === "number" && t > 1) saveTime(st.currentVideoId, t);
      }
      // Keep video cover sizing in case YT rewrote iframe
      const cfg = THEME_MEDIA[st.activeTheme!];
      if (cfg?.mode === "video") applyHostMode("video");
    } catch {
      /* */
    }
  }, 1500);
}

function createOrUpdatePlayer(cfg: ThemeMediaConfig) {
  if (!window.YT?.Player) return;
  const s = getSingleton();
  ensureHost();

  if (s.player && s.currentVideoId === cfg.videoId) {
    applyHostMode(cfg.mode);
    applyAudio();
    try {
      s.player.playVideo();
    } catch {
      /* */
    }
    return;
  }

  if (s.player && s.currentVideoId !== cfg.videoId) {
    const start = loadTime(cfg.videoId);
    try {
      s.player.loadVideoById({ videoId: cfg.videoId, startSeconds: start });
      s.currentVideoId = cfg.videoId;
      applyHostMode(cfg.mode);
      applyAudio();
      s.player.playVideo();
    } catch {
      /* */
    }
    return;
  }

  const el = document.getElementById("tsuzuku-theme-media-player");
  if (!el) return;

  const start = loadTime(cfg.videoId);
  s.player = new window.YT.Player(el, {
    videoId: cfg.videoId,
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      loop: 1,
      playlist: cfg.videoId,
      start: Math.floor(start) || 0,
      // mute initially for autoplay policies; we unmute via UI
      mute: 1,
    },
    events: {
      onReady: (e) => {
        const st = getSingleton();
        st.player = e.target;
        st.currentVideoId = cfg.videoId;
        applyHostMode(cfg.mode);
        applyAudio();
        if (start > 2) {
          try {
            e.target.seekTo(start, true);
          } catch {
            /* */
          }
        }
        if (st.activeTheme) {
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
  s.currentVideoId = cfg.videoId;
}

function loadYoutubeApi(cfg: ThemeMediaConfig) {
  if (typeof window === "undefined") return;
  if (window.YT?.Player) {
    createOrUpdatePlayer(cfg);
    return;
  }
  const s = getSingleton();
  if (s.apiLoading) {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* */
      }
      createOrUpdatePlayer(cfg);
    };
    return;
  }
  s.apiLoading = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    try {
      prev?.();
    } catch {
      /* */
    }
    createOrUpdatePlayer(cfg);
  };
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  }
}

export function setThemeMediaActive(theme: ThemeId | null) {
  const s = getSingleton();
  const cfg = theme ? THEME_MEDIA[theme] : undefined;

  if (!cfg) {
    // Leaving media theme
    if (s.activeTheme && s.currentVideoId) {
      try {
        const t = s.player?.getCurrentTime?.();
        if (typeof t === "number") saveTime(s.currentVideoId, t);
        s.player?.pauseVideo();
      } catch {
        /* */
      }
    }
    s.activeTheme = null;
    applyHostMode(null);
    notify();
    return;
  }

  s.activeTheme = theme;
  loadYoutubeApi(cfg);
  createOrUpdatePlayer(cfg);
  applyHostMode(cfg.mode);
  applyAudio();
  try {
    s.player?.playVideo();
  } catch {
    /* */
  }
  startWatchdogs();
  notify();
}

function setDesired(partial: Partial<AudioState>) {
  const s = getSingleton();
  s.desired = { ...s.desired, ...partial };
  try {
    localStorage.setItem(VOL_KEY, String(s.desired.volume));
    localStorage.setItem(MUTE_KEY, s.desired.muted ? "1" : "0");
  } catch {
    /* */
  }
  applyAudio();
  if (s.activeTheme && !s.desired.muted && s.desired.volume > 0) {
    try {
      s.player?.playVideo();
      s.player?.unMute();
    } catch {
      /* */
    }
  }
  notify();
}

function readMediaTheme(): ThemeId | null {
  if (typeof document === "undefined") return null;
  const t =
    (document.documentElement.getAttribute("data-theme") as ThemeId) || getStoredTheme();
  return THEME_MEDIA[t] ? t : null;
}

function useActiveMediaTheme(): ThemeId | null {
  const [theme, setTheme] = useState<ThemeId | null>(null);
  useEffect(() => {
    const sync = () => {
      const t = readMediaTheme();
      setTheme(t);
      setThemeMediaActive(t);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const t = readMediaTheme();
        if (t) setThemeMediaActive(t);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return theme;
}

function useAudioState(): AudioState {
  const [state, setState] = useState<AudioState>(() => {
    if (typeof window === "undefined") return { volume: 35, muted: true };
    return { ...getSingleton().desired };
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

/** Boot once at app root */
export function PrideMusic() {
  useActiveMediaTheme();
  return null;
}

/** Alias */
export const ThemeMediaBootstrap = PrideMusic;

/** Footer controls for any media theme (pride / lagtrain) */
export function PrideMusicControls({ className }: { className?: string }) {
  const theme = useActiveMediaTheme();
  const { volume, muted } = useAudioState();

  if (!theme) return null;

  const label = THEME_MEDIA_LABEL[theme] ?? "Musique";

  return (
    <div
      className={cn(
        "ml-auto flex shrink-0 items-center gap-2 rounded-full border border-line/80 bg-raised/95 px-2.5 py-1.5 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <span className="hidden sm:inline text-[10.5px] font-bold tracking-wide text-dim uppercase">
        {label}
      </span>
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
        aria-label={muted ? `Activer la musique ${label}` : `Couper la musique ${label}`}
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
        aria-label={`Volume ${label}`}
        title={`Volume ${muted ? 0 : volume}%`}
      />
      <span className="hidden min-[400px]:inline text-[10.5px] font-semibold tabular-nums text-dim">
        {muted ? 0 : volume}%
      </span>
    </div>
  );
}
