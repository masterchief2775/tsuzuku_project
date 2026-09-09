/**
 * Persona 5–style UI sounds.
 *
 * Plays files from /sounds/p5/ when present:
 *   click.wav|mp3|ogg, hover.*, open.*, back.*, confirm.*
 * If you place your own files there (personal use), they are preferred.
 * Otherwise falls back to bundled synthetic WAVs + Web Audio.
 */

export type SoundKind = "click" | "hover" | "open" | "back" | "confirm";

const MUTE_KEY = "tsuzuku:p5-ui-muted";
const VOL_KEY = "tsuzuku:p5-ui-volume";

const EXTS = ["wav", "ogg", "mp3"] as const;
const KINDS: SoundKind[] = ["click", "hover", "open", "back", "confirm"];

let unlocked = false;
let installed = false;
let lastHover = 0;
let lastPlay = 0;
const cache = new Map<string, HTMLAudioElement>();
const missing = new Set<string>();

function isPersona5(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "persona5"
  );
}

export function isP5UiMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setP5UiMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* */
  }
}

function volume(): number {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* */
  }
  return 0.55;
}

export function setP5UiVolume(v: number) {
  try {
    localStorage.setItem(VOL_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* */
  }
}

function candidates(kind: SoundKind): string[] {
  // Prefer user overrides in /sounds/p5/custom/ then default bundle
  const list: string[] = [];
  for (const ext of EXTS) {
    list.push(`/sounds/p5/custom/${kind}.${ext}`);
  }
  for (const ext of EXTS) {
    list.push(`/sounds/p5/${kind}.${ext}`);
  }
  return list;
}

function tryPlayAudio(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (missing.has(src)) {
      resolve(false);
      return;
    }
    let audio = cache.get(src);
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      audio.src = src;
      cache.set(src, audio);
    }
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume();
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(() => resolve(true)).catch(() => {
        missing.add(src);
        resolve(false);
      });
    } else {
      resolve(true);
    }
  });
}

/** Web Audio fallback if no file plays */
function playSynth(kind: SoundKind) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = volume();
    master.connect(ac.destination);

    const tone = (freq: number, t0: number, dur: number, type: OscillatorType, gain: number) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    };

    switch (kind) {
      case "hover":
        tone(880, now, 0.04, "square", 0.12);
        tone(1320, now + 0.02, 0.03, "square", 0.08);
        break;
      case "open":
        tone(220, now, 0.08, "sawtooth", 0.16);
        tone(440, now + 0.05, 0.1, "square", 0.14);
        tone(880, now + 0.12, 0.12, "square", 0.1);
        break;
      case "back":
        tone(660, now, 0.06, "square", 0.14);
        tone(330, now + 0.05, 0.1, "triangle", 0.12);
        break;
      case "confirm":
        tone(523, now, 0.07, "square", 0.16);
        tone(784, now + 0.06, 0.1, "square", 0.14);
        tone(1046, now + 0.14, 0.14, "triangle", 0.12);
        break;
      default:
        tone(620, now, 0.05, "square", 0.18);
        tone(930, now + 0.03, 0.06, "square", 0.12);
        break;
    }
    window.setTimeout(() => void ac.close(), 800);
  } catch {
    /* */
  }
}

export async function playP5Ui(kind: SoundKind = "click") {
  if (typeof window === "undefined") return;
  if (!isPersona5()) return;
  if (isP5UiMuted()) return;

  const t = performance.now();
  if (kind === "hover" && t - lastHover < 90) return;
  if (kind === "hover") lastHover = t;
  if (kind !== "hover" && t - lastPlay < 30) return;
  if (kind !== "hover") lastPlay = t;

  unlocked = true;

  for (const src of candidates(kind)) {
    // Skip probing custom paths that 404 repeatedly after first miss
    if (missing.has(src)) continue;
    const ok = await tryPlayAudio(src);
    if (ok) return;
  }
  playSynth(kind);
}

/** Warm the default wav into cache so first click is instant */
export function preloadP5UiSounds() {
  if (typeof window === "undefined") return;
  for (const kind of KINDS) {
    const src = `/sounds/p5/${kind}.wav`;
    if (cache.has(src)) continue;
    const a = new Audio();
    a.preload = "auto";
    a.src = src;
    cache.set(src, a);
  }
}

export function unlockP5UiAudio() {
  unlocked = true;
  // Play silent buffer via a tiny audio to satisfy autoplay policies
  try {
    const a = new Audio("/sounds/p5/click.wav");
    a.volume = 0.001;
    void a.play().then(() => {
      a.pause();
    }).catch(() => {});
  } catch {
    /* */
  }
}

export function installP5UiSounds() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const onTheme = () => {
    if (isPersona5()) preloadP5UiSounds();
  };
  onTheme();
  const obs = new MutationObserver(onTheme);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Unlock audio on first gesture anywhere
  const unlock = () => {
    unlockP5UiAudio();
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (!isPersona5()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(
        "button, a, [role='button'], [role='menuitem'], input[type='submit'], input[type='button'], select, summary, [data-p5-sound]",
      );
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.p5Silent === "1") return;
      const kind = (el.dataset.p5Sound as SoundKind | undefined) || "click";
      void playP5Ui(kind === "hover" ? "click" : kind);
    },
    true,
  );

  document.addEventListener(
    "mouseover",
    (ev) => {
      if (!isPersona5()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("button, a, [role='button']");
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.p5Silent === "1") return;
      // only when entering the element itself (not bubbling from children repeatedly)
      if (ev.relatedTarget instanceof Node && el.contains(ev.relatedTarget)) return;
      void playP5Ui("hover");
    },
    true,
  );
}
