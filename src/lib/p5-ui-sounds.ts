/**
 * Persona 5–inspired UI sounds (synthetic, not ripped game assets).
 * Only active while data-theme="persona5".
 */

type SoundKind = "click" | "hover" | "open" | "back" | "confirm";

const MUTE_KEY = "tsuzuku:p5-ui-muted";
const VOL_KEY = "tsuzuku:p5-ui-volume";

let ctx: AudioContext | null = null;
let lastHover = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function isPersona5(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "persona5";
}

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function volume(): number {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* */
  }
  return 0.35;
}

export function setP5UiMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* */
  }
}

export function isP5UiMuted() {
  return isMuted();
}

/** Short synthetic blips reminiscent of stylish menu SFX. */
export function playP5Ui(kind: SoundKind = "click") {
  if (!isPersona5() || isMuted()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();

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
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };

  switch (kind) {
    case "hover":
      tone(880, now, 0.04, "square", 0.08);
      tone(1320, now + 0.02, 0.03, "square", 0.05);
      break;
    case "open":
      tone(220, now, 0.08, "sawtooth", 0.12);
      tone(440, now + 0.05, 0.1, "square", 0.1);
      tone(880, now + 0.12, 0.12, "square", 0.08);
      break;
    case "back":
      tone(660, now, 0.06, "square", 0.1);
      tone(330, now + 0.05, 0.1, "triangle", 0.09);
      break;
    case "confirm":
      tone(523, now, 0.07, "square", 0.12);
      tone(784, now + 0.06, 0.1, "square", 0.11);
      tone(1046, now + 0.14, 0.14, "triangle", 0.09);
      break;
    case "click":
    default:
      tone(620, now, 0.05, "square", 0.14);
      tone(930, now + 0.03, 0.06, "square", 0.09);
      break;
  }
}

function shouldHandleTarget(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const hit = el.closest(
    "button, a, [role='button'], [role='menuitem'], input[type='submit'], input[type='button'], select, summary",
  );
  return hit instanceof HTMLElement ? hit : null;
}

/** Install global listeners once. Safe to call repeatedly. */
export function installP5UiSounds() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __tsuzukuP5Ui?: boolean };
  if (w.__tsuzukuP5Ui) return;
  w.__tsuzukuP5Ui = true;

  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (!isPersona5()) return;
      const el = shouldHandleTarget(ev.target);
      if (!el) return;
      if (el.dataset.p5Silent === "1") return;
      const kind: SoundKind =
        el.dataset.p5Sound === "confirm"
          ? "confirm"
          : el.dataset.p5Sound === "back"
            ? "back"
            : el.dataset.p5Sound === "open"
              ? "open"
              : "click";
      playP5Ui(kind);
    },
    true,
  );

  document.addEventListener(
    "pointerenter",
    (ev) => {
      if (!isPersona5()) return;
      const el = shouldHandleTarget(ev.target);
      if (!el) return;
      if (el.tagName !== "A" && el.tagName !== "BUTTON" && el.getAttribute("role") !== "button") return;
      const t = performance.now();
      if (t - lastHover < 80) return;
      lastHover = t;
      playP5Ui("hover");
    },
    true,
  );
}
