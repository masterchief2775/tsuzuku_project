import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings,
  SkipForward,
  SkipBack,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatClock,
  formatOffset,
  formatRemaining,
  percentFromDigit,
  PLAYBACK_RATES,
  progressRatio,
  SEEK_STEP_SECONDS,
  SKIP_STEP_SECONDS,
} from "@/lib/player";
import type { Engine } from "@/components/tsuzuku/use-player-engine";

/**
 * The video surface and its controls.
 *
 * The `<video>` element is present and real, with no source: it renders the
 * placeholder, and the simulated engine drives the timeline. Every control below
 * is wired to the engine, so swapping in a source changes nothing here.
 */

type PlayerControlsProps = {
  engine: Engine;
  title: string;
  episodeLabel: string;
  onNext: (() => void) | null;
  onPrevious: (() => void) | null;
  onExit: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  /** Label for the intro/ending skip button, or null when no cue is active. */
  skipCueLabel: string | null;
  onSkip: () => void;
  onShortcuts: () => void;
};

export function PlayerSurface({
  engine,
  title,
  episodeLabel,
  onNext,
  onPrevious,
  onExit,
  onToggleFullscreen,
  isFullscreen,
  skipCueLabel: skipText,
  onSkip,
  onShortcuts,
}: PlayerControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<number | null>(null);

  // Hide the chrome while playing and the pointer is still, the way every player
  // does. Any movement brings it back.
  const bumpIdle = useCallback(() => {
    setIdle(false);
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    if (!engine.playing) return;
    idleTimerRef.current = window.setTimeout(() => setIdle(true), 2800);
  }, [engine.playing]);

  useEffect(() => {
    bumpIdle();
    return () => {
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    };
  }, [bumpIdle]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-[12px] border border-line bg-black",
        idle && engine.playing && "cursor-none",
      )}
      onMouseMove={bumpIdle}
      onTouchStart={bumpIdle}
    >
      <video
        className="h-full w-full bg-black"
        poster={undefined}
        // No source is connected yet: the engine simulates playback. `muted` is
        // set because a real element must be muted before programmatic play().
        muted
        playsInline
        preload="none"
        aria-label={`${title} — ${episodeLabel}`}
      />

      {/* No placeholder text inside the frame: on a phone-sized 16:9 box the big
          play button sits dead centre and any caption collided with it. The
          "no source yet" note lives under the player instead. */}

      {/* Click to toggle play, but never swallow a click on a control. */}
      <button
        type="button"
        aria-label={engine.playing ? "Pause" : "Lecture"}
        onClick={engine.togglePlay}
        className={cn(
          "absolute inset-0 grid place-items-center transition-opacity",
          idle ? "opacity-0" : "opacity-100",
        )}
      >
        <span
          className={cn(
            "grid size-16 place-items-center rounded-full border border-ink/20 bg-black/55 backdrop-blur transition-transform",
            engine.playing ? "scale-0 opacity-0" : "scale-100",
          )}
        >
          {engine.playing ? null : <Play className="size-7 translate-x-0.5 text-ink" />}
        </span>
      </button>

      {skipText ? (
        <button
          type="button"
          onClick={onSkip}
          className="absolute bottom-24 right-4 rounded-full border border-ink/20 bg-black/70 px-4 py-2 text-[12.5px] font-bold text-ink backdrop-blur transition hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          {skipText}
        </button>
      ) : null}

      {engine.ended ? (
        <div className="absolute inset-x-0 bottom-16 flex justify-center">
          {onNext ? (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-bg transition hover:bg-lime/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              <SkipForward className="size-4" /> Épisode suivant
            </button>
          ) : (
            <p className="rounded-full bg-black/70 px-5 py-2.5 text-sm font-bold text-ink backdrop-blur">
              Fin de la série
            </p>
          )}
        </div>
      ) : null}

      {/* Controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-8 transition-opacity sm:px-4",
          idle ? "opacity-0" : "opacity-100",
        )}
      >
        <SeekBar engine={engine} />

        {/* Wraps on narrow screens: at 390px the row no longer fits on one line, and
              without this the right-hand group (shortcuts, exit, fullscreen) was
              silently pushed out of the clipped player box. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink">
          <ControlButton
            label={engine.playing ? "Pause" : "Lecture"}
            onClick={engine.togglePlay}
          >
            {engine.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </ControlButton>

          <ControlButton label="Reculer de 10 s" onClick={() => engine.seekBy(-SKIP_STEP_SECONDS)} small>
            <SkipBack className="size-4" />
          </ControlButton>
          <ControlButton label="Avancer de 10 s" onClick={() => engine.seekBy(SKIP_STEP_SECONDS)} small>
            <SkipForward className="size-4" />
          </ControlButton>

          <ControlButton
            label="Épisode précédent"
            onClick={() => onPrevious?.()}
            disabled={!onPrevious}
            small
          >
            <ChevronLeft className="size-5" />
          </ControlButton>
          <ControlButton
            label="Épisode suivant"
            onClick={() => onNext?.()}
            disabled={!onNext}
            small
          >
            <ChevronRight className="size-5" />
          </ControlButton>

          <div className="group/vol flex items-center">
            <ControlButton
              label={engine.muted ? "Réactiver le son" : "Couper le son"}
              onClick={engine.toggleMute}
              small
            >
              {engine.muted || engine.volume === 0 ? (
                <VolumeX className="size-4" />
              ) : engine.volume < 0.5 ? (
                <Volume1 className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={engine.muted ? 0 : engine.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="ml-1 hidden h-1 w-20 cursor-pointer accent-lime group-hover/vol:block focus-visible:block"
            />
          </div>

          <span className="ml-1 shrink-0 text-[11.5px] font-semibold tabular-nums text-ink/85">
            {formatClock(engine.current)} / {formatClock(engine.duration)}
          </span>
          <span className="hidden shrink-0 text-[11.5px] tabular-nums text-ink/55 sm:inline">
            {formatRemaining(Math.max(0, engine.duration - engine.current))}
          </span>

          <div className="relative ml-auto">
              <ControlButton
                label="Réglages"
                ariaExpanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                small
              >
                <Settings className="size-4" />
              </ControlButton>
              {menuOpen ? (
                <SettingsMenu
                  rate={engine.rate}
                  onRate={(r) => engine.setRate(r)}
                  onClose={() => setMenuOpen(false)}
                />
              ) : null}
            </div>
            <ControlButton
              label="Raccourcis clavier"
              onClick={onShortcuts}
              small
            >
              <span className="text-[11px] font-bold">?</span>
            </ControlButton>

            <ControlButton label="Quitter le lecteur" onClick={onExit} small>
              <ChevronDown className="size-5" />
            </ControlButton>

            <ControlButton
              label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              onClick={onToggleFullscreen}
              small
            >
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </ControlButton>
        </div>
      </div>
    </div>
  );
}

/** Scrubber: pointer drag, keyboard step, and a hover time preview. */
function SeekBar({ engine }: { engine: Engine }) {
  const [drag, setDrag] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const ratioFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || engine.duration <= 0) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, [engine.duration]);

  const shown = drag ?? progressRatio(engine.current, engine.duration);
  const shownSeconds = drag != null ? drag * engine.duration : engine.current;
  const offset = shownSeconds - engine.current;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label="Progression"
      aria-valuemin={0}
      aria-valuemax={Math.round(engine.duration)}
      aria-valuenow={Math.round(engine.current)}
      aria-valuetext={`${formatClock(engine.current)} sur ${formatClock(engine.duration)}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          engine.seekBy(SEEK_STEP_SECONDS);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          engine.seekBy(-SEEK_STEP_SECONDS);
        } else if (e.key === "Home") {
          e.preventDefault();
          engine.seek(0);
        } else if (e.key === "End") {
          e.preventDefault();
          engine.seek(engine.duration);
        }
        const percent = percentFromDigit(e.key);
        if (percent != null) {
          e.preventDefault();
          engine.seek((percent / 100) * engine.duration);
        }
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(ratioFromEvent(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag == null) return;
        setDrag(ratioFromEvent(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag == null) return;
        engine.seek(drag * engine.duration);
        setDrag(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => setDrag(null)}
      className="group/bar relative h-4 cursor-pointer touch-none select-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink/25">
        <div
          className="h-full rounded-full bg-lime"
          style={{ width: `${shown * 100}%` }}
        />
        {drag != null ? (
          <span
            className="absolute -top-6 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink"
            style={{ left: `${shown * 100}%` }}
          >
            {formatClock(shownSeconds)}
            {Math.abs(offset) > 1 ? (
              <span className="ml-1 text-ink/60">{formatOffset(offset)}</span>
            ) : null}
          </span>
        ) : null}
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-lime opacity-0 transition-opacity group-hover/bar:opacity-100"
          style={{ left: `${shown * 100}%` }}
        />
      </div>
    </div>
  );
}

function SettingsMenu({
  rate,
  onRate,
  onClose,
}: {
  rate: number;
  onRate: (r: (typeof PLAYBACK_RATES)[number]) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Réglages de lecture"
      className="absolute bottom-11 right-0 z-20 w-48 rounded-[10px] border border-line bg-raised/95 p-1.5 shadow-2xl backdrop-blur"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-dim">
        <Gauge className="size-3.5" /> Vitesse
      </p>
      {PLAYBACK_RATES.map((r) => (
        <button
          key={r}
          role="menuitemradio"
          aria-checked={r === rate}
          type="button"
          onClick={() => {
            onRate(r);
            onClose();
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-[7px] px-2 py-1.5 text-left text-[12.5px] font-semibold transition",
            r === rate ? "bg-lime text-bg" : "text-ink hover:bg-bg",
          )}
        >
          {r === 1 ? "Normale" : `${r}×`}
          {r === rate ? <span aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  small,
  disabled,
  ariaExpanded,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
  disabled?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-ink transition hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent",
        small ? "size-8" : "size-9",
      )}
    >
      {children}
    </button>
  );
}

