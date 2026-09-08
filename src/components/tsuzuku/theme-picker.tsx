import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import {
  applyTheme,
  getStoredTheme,
  isSecretThemeUnlocked,
  recordSecretThemeInput,
  THEMES,
  type ThemeId,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const STANDARD_IDS = new Set(["dark", "light", "sakura", "ocean"]);

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = getStoredTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (id: ThemeId) => {
    const standard = STANDARD_IDS.has(id);
    if (!standard && !isSecretThemeUnlocked(id)) return;
    setTheme(id);
    applyTheme(id);
    setOpen(false);
    setSecretVisible(false);
    setSecretInput("");
  };

  const handleSecretSubmit = () => {
    const nextTheme = recordSecretThemeInput(secretInput);
    if (nextTheme) {
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setSecretVisible(false);
      setSecretInput("");
      setOpen(false);
      return;
    }
    setSecretInput("");
  };

  const standardThemes = THEMES.filter((t) => STANDARD_IDS.has(t.id));
  const unlockedSecretThemes = THEMES.filter(
    (t) => !STANDARD_IDS.has(t.id) && isSecretThemeUnlocked(t.id as ThemeId),
  );
  const hasUnlockedSecretTheme = unlockedSecretThemes.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-[10px] border border-line/80 bg-raised/95 p-2.5 text-ink shadow-lg shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-lime/50 hover:shadow-[0_0_0_1px_rgba(200,255,77,0.12),0_10px_24px_rgba(0,0,0,0.22)]"
        aria-label="Changer le thème"
        title="Thème"
        aria-expanded={open}
      >
        <Palette className="size-4" />
      </button>
      {open ? (
        <div className="absolute top-11 right-0 z-[80] w-64 overflow-hidden rounded-[16px] border border-line/80 bg-raised/95 shadow-[0_16px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="max-h-[min(65vh,26rem)] overflow-y-auto p-2.5">
            <div className="mb-2 px-0.5 text-[10.5px] font-semibold tracking-[0.18em] text-dim uppercase">
              Thème
            </div>
            <div className="grid grid-cols-2 gap-1">
              {standardThemes.map((t) => (
                <ThemeChip key={t.id} theme={t} active={theme === t.id} onSelect={pick} />
              ))}
            </div>

            {hasUnlockedSecretTheme ? (
              <>
                <div className="mt-3 mb-1.5 px-0.5 text-[10.5px] font-semibold tracking-[0.18em] text-dim uppercase">
                  Thèmes cachés
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {unlockedSecretThemes.map((t) => (
                    <ThemeChip key={t.id} theme={t} active={theme === t.id} onSelect={pick} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="border-t border-line/80 p-2.5">
            <button
              type="button"
              onClick={() => setSecretVisible((v) => !v)}
              className="w-full rounded-[10px] px-2 py-1.5 text-left text-[10.5px] font-medium text-dim transition-colors hover:bg-bg hover:text-ink"
            >
              {secretVisible ? "Masquer le code" : "Thème caché"}
            </button>
            {secretVisible ? (
              <div className="mt-2 space-y-2">
                <input
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSecretSubmit();
                  }}
                  placeholder="••••••"
                  className="w-full rounded-[10px] border border-line bg-bg/90 px-2.5 py-1.5 text-xs text-ink outline-none placeholder:text-dim transition focus:border-lime/40 focus:ring-2 focus:ring-lime/10"
                  aria-label="Code secret"
                />
                <button
                  type="button"
                  onClick={handleSecretSubmit}
                  className="w-full rounded-[10px] bg-lime px-2 py-1.5 text-[11px] font-bold text-bg transition hover:brightness-110"
                >
                  Déverrouiller
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThemeChip({
  theme,
  active,
  onSelect,
}: {
  theme: { id: ThemeId; label: string; swatch: [string, string, string] };
  active: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(theme.id)}
      title={theme.label}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-left text-[11.5px] font-semibold transition-all duration-150",
        active ? "bg-bg text-ink ring-1 ring-lime/25" : "text-dim hover:bg-bg/80 hover:text-ink",
      )}
    >
      <span className="flex shrink-0 -space-x-1">
        {theme.swatch.map((c, i) => (
          <span
            key={i}
            className="size-2.5 rounded-full border border-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
            style={{ background: c }}
          />
        ))}
      </span>
      <span className="truncate">{theme.label}</span>
    </button>
  );
}
