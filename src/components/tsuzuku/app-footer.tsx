import { BrandMark } from "@/components/tsuzuku/brand-mark";
import { PrideMusicControls, P5UiSoundToggle } from "@/components/tsuzuku/pride-music";

export function AppFooter({ publicPage = false }: { publicPage?: boolean }) {
  return (
    <footer className="mt-auto border-t border-line/70 px-4 py-5 text-dim sm:px-7">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 text-[11px] sm:gap-4 sm:text-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="rounded-[11px] shadow-none" />
          <span className="truncate">Tsuzuku · ta watchlist, en continu</span>
        </div>
        <span className="hidden shrink-0 sm:inline">
          {publicPage ? "Liste partagée" : "Anime list personnelle"}
        </span>
        {/* Pushed fully to the right */}
        <div className="ml-auto flex items-center gap-1">
          <PrideMusicControls className="!ml-0" />
          <P5UiSoundToggle />
        </div>
      </div>
    </footer>
  );
}
