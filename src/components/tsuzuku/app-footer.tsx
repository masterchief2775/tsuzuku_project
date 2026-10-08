import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { PrideMusicControls, P5UiSoundToggle } from "@/components/tsuzuku/pride-music";

export function AppFooter({ publicPage = false }: { publicPage?: boolean }) {
  return (
    <footer className="mt-auto border-t border-line/70 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-dim sm:px-7">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 text-[11px] sm:text-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="rounded-[11px] shadow-none" />
          <span className="truncate">Tsuzuku · ta watchlist, en continu</span>
        </div>
        <span className="hidden shrink-0 sm:inline">
          {publicPage ? "Liste partagée" : "Anime list personnelle"}
        </span>
        {!publicPage ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("tsuzuku:open-help"))}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 font-semibold transition hover:border-lime/40 hover:text-ink"
            title="Raccourcis clavier (?)"
          >
            ? Raccourcis
          </button>
        ) : null}
        {/* Pushed fully to the right */}
        <div className="ml-auto flex items-center gap-1">
          <PrideMusicControls className="!ml-0" />
          <P5UiSoundToggle />
        </div>
      </div>
    </footer>
  );
}
