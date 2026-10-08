export type StandardThemeId = "dark" | "light" | "sakura" | "ocean" | "foret" | "soleil";
export type SecretThemeId =
  | "void"
  | "ember"
  | "neon"
  | "aurora"
  | "manga"
  | "mono"
  | "qc-sombre"
  | "qc-clair"
  | "pride"
  | "lagtrain"
  | "lost-umbrella"
  | "persona5";
export type ThemeId = StandardThemeId | SecretThemeId;

const STORAGE_KEY = "tsuzuku-theme";
const SECRET_STORAGE_KEY = "tsuzuku-secret-themes";
const LEGACY_SECRET_STORAGE_KEY = "tsuzuku-secret-theme";

const STANDARD_THEME_IDS: StandardThemeId[] = [
  "dark",
  "light",
  "sakura",
  "ocean",
  "foret",
  "soleil",
];

const ALL_SECRET_THEME_IDS: SecretThemeId[] = [
  "void",
  "ember",
  "neon",
  "aurora",
  "manga",
  "mono",
  "qc-sombre",
  "qc-clair",
  "pride",
  "lagtrain",
  "lost-umbrella",
  "persona5",
];

function isSecretThemeId(value: string): value is SecretThemeId {
  return (ALL_SECRET_THEME_IDS as string[]).includes(value);
}

export const SECRET_THEME_CODES: Record<SecretThemeId, string> = {
  void: "tsuzuku",
  ember: "foudre",
  neon: "neon",
  aurora: "aurore",
  manga: "mangaka",
  mono: "encre",
  "qc-sombre": "qclibre",
  "qc-clair": "duplessis",
  pride: "pride",
  lagtrain: "lagtrain",
  "lost-umbrella": "lostumbrella",
  persona5: "phantom",
};

const SECRET_THEMES: { id: SecretThemeId; label: string; swatch: [string, string, string] }[] = [
  { id: "void", label: "Nuit cachée", swatch: ["#070b12", "#8b5cf6", "#1d2940"] },
  { id: "ember", label: "Ember", swatch: ["#170d0b", "#ff8a65", "#ffcc33"] },
  { id: "neon", label: "Neon", swatch: ["#070b16", "#a3ff12", "#ff4bd6"] },
  { id: "aurora", label: "Aurora", swatch: ["#071d22", "#62e6c5", "#17484a"] },
  { id: "manga", label: "Manga", swatch: ["#fff8ed", "#d93656", "#ffe0a8"] },
  { id: "mono", label: "Monochrome", swatch: ["#101010", "#f5f5f5", "#353535"] },
  { id: "qc-sombre", label: "Québec sombre", swatch: ["#0a1628", "#3d7cff", "#1a2f4d"] },
  { id: "qc-clair", label: "Québec clair", swatch: ["#f4f7fb", "#003da5", "#ffffff"] },
  { id: "pride", label: "Pride", swatch: ["#1a0f1f", "#ff2d95", "#ffd400"] },
  { id: "lagtrain", label: "Lagtrain", swatch: ["#0c0e18", "#7eb6ff", "#2a3148"] },
  { id: "lost-umbrella", label: "Lost Umbrella", swatch: ["#10131c", "#9fb0d9", "#2a2f42"] },
  { id: "persona5", label: "Persona 5", swatch: ["#0a0a0a", "#f52236", "#ffffff"] },
];

export const THEMES: { id: ThemeId; label: string; swatch: [string, string, string] }[] = [
  { id: "dark", label: "Nuit", swatch: ["#14161f", "#c8ff4d", "#1b1e2b"] },
  { id: "light", label: "Jour", swatch: ["#f4f2ec", "#3d7a1c", "#ffffff"] },
  { id: "sakura", label: "Sakura", swatch: ["#1a1218", "#ff8fab", "#241820"] },
  { id: "ocean", label: "Océan", swatch: ["#0c1520", "#4fd1c5", "#132033"] },
  { id: "foret", label: "Forêt", swatch: ["#0d1512", "#7bf59b", "#16241d"] },
  { id: "soleil", label: "Soleil", swatch: ["#fdf6ec", "#b3540a", "#ffffff"] },
  ...SECRET_THEMES,
];

export function getUnlockedSecretThemes(): SecretThemeId[] {
  if (typeof window === "undefined") return [];

  const parsed = window.localStorage.getItem(SECRET_STORAGE_KEY);
  const unlocked: SecretThemeId[] = [];

  if (parsed) {
    try {
      const values = JSON.parse(parsed) as unknown;
      if (Array.isArray(values)) {
        for (const value of values) {
          if (typeof value === "string" && isSecretThemeId(value)) {
            unlocked.push(value);
          }
        }
      }
    } catch {
      // ignore malformed storage and fall through to the legacy key
    }
  }

  if (
    window.localStorage.getItem(LEGACY_SECRET_STORAGE_KEY) === "true" &&
    !unlocked.includes("void")
  ) {
    unlocked.push("void");
  }

  return [...new Set(unlocked)];
}

export function isSecretThemeUnlocked(id?: ThemeId): boolean {
  if (typeof window === "undefined") return false;
  const target = id ?? "void";
  if ((STANDARD_THEME_IDS as string[]).includes(target)) {
    return true;
  }
  return getUnlockedSecretThemes().includes(target as SecretThemeId);
}

export function unlockSecretTheme(id: SecretThemeId): void {
  if (typeof window === "undefined") return;
  const unlocked = getUnlockedSecretThemes();
  if (!unlocked.includes(id)) {
    unlocked.push(id);
    window.localStorage.setItem(SECRET_STORAGE_KEY, JSON.stringify(unlocked));
    window.localStorage.removeItem(LEGACY_SECRET_STORAGE_KEY);
  }
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current === id || current === null) {
    window.localStorage.setItem(STORAGE_KEY, id);
  }
}

export function recordSecretThemeInput(input: string): SecretThemeId | null {
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  const match = (Object.entries(SECRET_THEME_CODES) as [SecretThemeId, string][]).find(
    ([, code]) => code === normalized,
  );

  if (!match) return null;
  const [themeId] = match;
  if (!isSecretThemeUnlocked(themeId)) {
    unlockSecretTheme(themeId);
  }
  return themeId;
}

export function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(STORAGE_KEY);
  const valid: ThemeId[] = [...STANDARD_THEME_IDS, ...ALL_SECRET_THEME_IDS];

  if (v && isSecretThemeId(v) && !isSecretThemeUnlocked(v)) {
    return "dark";
  }
  if (v && valid.includes(v as ThemeId)) return v as ThemeId;
  return "dark";
}

export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const safeId =
    !(STANDARD_THEME_IDS as string[]).includes(id) && !isSecretThemeUnlocked(id) ? "dark" : id;
  document.documentElement.setAttribute("data-theme", safeId);
  window.localStorage.setItem(STORAGE_KEY, safeId);
  if (safeId === "persona5") {
    void import("@/lib/p5-ui-sounds").then((m) => {
      m.installP5UiSounds();
      m.preloadP5UiSounds();
    });
  }
}
