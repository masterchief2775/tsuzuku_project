import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getStoredTheme, type ThemeId } from "@/lib/theme";

const YT_ID = "beINamVRGy4";
const MUTE_KEY = "tsuzuku:pride-music-muted";

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Background music for the Pride theme only (YouTube embed). */
export function PrideMusic() {
  const [theme, setTheme] = useState<ThemeId>(() =>
    typeof window !== "undefined" ? getStoredTheme() : "dark",
  );
  const [muted, setMuted] = useState(true); // start muted until user unmutes (autoplay policies)
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMuted(readMuted());
    setReady(true);
  }, []);

  // Observe theme changes on <html data-theme>
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => {
      const t = (el.getAttribute("data-theme") as ThemeId) || getStoredTheme();
      setTheme(t);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const active = theme === "pride";

  useEffect(() => {
    if (!active) return;
    // When entering pride, respect stored mute preference
    setMuted(readMuted());
  }, [active]);

  if (!active || !ready) return null;

  const src =
    `https://www.youtube.com/embed/${YT_ID}` +
    `?autoplay=1&loop=1&playlist=${YT_ID}&controls=0&disablekb=1` +
    `&fs=0&modestbranding=1&playsinline=1&rel=0` +
    (muted ? "&mute=1" : "&mute=0");

  return (
    <>
      {/* Hidden player — audio only intent; video not shown */}
      <iframe
        key={muted ? "m" : "u"}
        title="Musique Pride"
        src={src}
        allow="autoplay; encrypted-media"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => {
          const next = !muted;
          setMuted(next);
          try {
            localStorage.setItem(MUTE_KEY, next ? "1" : "0");
          } catch {
            /* */
          }
        }}
        className="fixed right-4 bottom-4 z-[90] inline-flex items-center gap-2 rounded-full border border-line bg-raised/95 px-3 py-2 text-[12px] font-semibold text-ink shadow-lg backdrop-blur-md hover:border-lime/50"
        title={muted ? "Activer la musique" : "Couper la musique"}
        aria-label={muted ? "Activer la musique Pride" : "Couper la musique Pride"}
      >
        {muted ? <VolumeX className="size-4 text-dim" /> : <Volume2 className="size-4 text-lime" />}
        {muted ? "Musique" : "Pride ♪"}
      </button>
    </>
  );
}
