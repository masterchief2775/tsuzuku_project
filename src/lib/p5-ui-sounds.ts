/**
 * Persona 5 UI sounds — must play inside the user-gesture stack (no await before play).
 * Files: /sounds/p5/{kind}.wav|mp3|ogg and optional /sounds/p5/custom/{kind}.*
 */

export type SoundKind = "click" | "hover" | "open" | "back" | "confirm";

const MUTE_KEY = "tsuzuku:p5-ui-muted";
const VOL_KEY = "tsuzuku:p5-ui-volume";

const EXTS = ["wav", "mp3", "ogg"] as const;
const KINDS: SoundKind[] = ["click", "hover", "open", "back", "confirm"];

let installed = false;
let lastHover = 0;
let lastClick = 0;

/** resolved src per kind once found */
const resolved = new Map<SoundKind, string>();
/** src known to 404 / unsupported */
const broken = new Set<string>();
const audioPool = new Map<string, HTMLAudioElement>();

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
  return 0.7;
}

export function setP5UiVolume(v: number) {
  try {
    localStorage.setItem(VOL_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* */
  }
}

function pathsFor(kind: SoundKind): string[] {
  const out: string[] = [];
  for (const ext of EXTS) out.push(`/sounds/p5/custom/${kind}.${ext}`);
  for (const ext of EXTS) out.push(`/sounds/p5/${kind}.${ext}`);
  return out;
}

function getAudio(src: string): HTMLAudioElement {
  let a = audioPool.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = "auto";
    audioPool.set(src, a);
  }
  return a;
}

/** Fire-and-forget play; returns true if play() was invoked without sync throw */
function playSrcNow(src: string): boolean {
  if (broken.has(src)) return false;
  try {
    const a = getAudio(src);
    a.pause();
    try {
      a.currentTime = 0;
    } catch {
      /* */
    }
    a.volume = volume();
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.catch((err: unknown) => {
        const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
        // Do NOT blacklist on autoplay NotAllowedError — only real media errors
        if (name === "NotSupportedError" || name === "NotFoundError") {
          broken.add(src);
          if (resolved.get(KINDS.find((k) => pathsFor(k).includes(src))!) === src) {
            /* will re-resolve next time */
          }
        }
        // Media load error
        a.addEventListener(
          "error",
          () => {
            broken.add(src);
          },
          { once: true },
        );
      });
    }
    return true;
  } catch {
    broken.add(src);
    return false;
  }
}

/**
 * Resolve best src for a kind without blocking play on first call:
 * - if already resolved, use it
 * - else try paths in order until one play() is accepted
 */
export function playP5Ui(kind: SoundKind = "click") {
  if (typeof window === "undefined") return;
  if (!isPersona5()) return;
  if (isP5UiMuted()) return;

  const now = performance.now();
  if (kind === "hover") {
    if (now - lastHover < 100) return;
    lastHover = now;
  } else {
    if (now - lastClick < 25) return;
    lastClick = now;
  }

  const known = resolved.get(kind);
  if (known && !broken.has(known)) {
    playSrcNow(known);
    return;
  }

  // Try each candidate SYNCHRONOUSLY in the gesture stack — no await
  for (const src of pathsFor(kind)) {
    if (broken.has(src)) continue;
    const a = getAudio(src);
    // If already errored while loading, skip
    if (a.error) {
      broken.add(src);
      continue;
    }
    const ok = playSrcNow(src);
    if (ok) {
      resolved.set(kind, src);
      // If this src later fails to load, clear resolution
      a.addEventListener(
        "error",
        () => {
          broken.add(src);
          if (resolved.get(kind) === src) resolved.delete(kind);
        },
        { once: true },
      );
      return;
    }
  }
}

export function preloadP5UiSounds() {
  if (typeof window === "undefined") return;
  for (const kind of KINDS) {
    for (const src of pathsFor(kind)) {
      if (broken.has(src)) continue;
      const a = getAudio(src);
      a.addEventListener(
        "error",
        () => {
          broken.add(src);
        },
        { once: true },
      );
      // Prefer first that can load
      a.addEventListener(
        "canplaythrough",
        () => {
          if (!resolved.has(kind) && !broken.has(src)) resolved.set(kind, src);
        },
        { once: true },
      );
    }
  }
}

export function unlockP5UiAudio() {
  // Play muted tick to unlock — sync in gesture if possible
  try {
    const src = resolved.get("click") || "/sounds/p5/click.wav";
    const a = getAudio(src);
    const prev = a.volume;
    a.volume = 0.001;
    void a.play().then(() => {
      a.pause();
      a.volume = prev;
    }).catch(() => {
      a.volume = prev;
    });
  } catch {
    /* */
  }
}

export function installP5UiSounds() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const boot = () => {
    if (isPersona5()) preloadP5UiSounds();
  };
  boot();
  new MutationObserver(boot).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (!isPersona5()) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const el = t.closest(
        "button, a, [role='button'], [role='menuitem'], input[type='submit'], input[type='button'], select, summary, [data-p5-sound]",
      );
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.p5Silent === "1") return;

      const raw = el.dataset.p5Sound as SoundKind | undefined;
      const kind: SoundKind =
        raw === "hover" || raw === "open" || raw === "back" || raw === "confirm" || raw === "click"
          ? raw
          : "click";
      // Must stay synchronous for autoplay permission
      playP5Ui(kind);
    },
    true,
  );

  document.addEventListener(
    "mouseover",
    (ev) => {
      if (!isPersona5()) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("button, a, [role='button']");
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.p5Silent === "1") return;
      if (ev.relatedTarget instanceof Node && el.contains(ev.relatedTarget)) return;
      playP5Ui("hover");
    },
    true,
  );
}
