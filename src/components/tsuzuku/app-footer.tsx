import { BrandMark } from "@/components/tsuzuku/brand-mark";

export function AppFooter({ publicPage = false }: { publicPage?: boolean }) {
  return (
    <footer className="mt-auto border-t border-line/70 px-4 py-5 text-dim sm:px-7">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 text-[11px] sm:text-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="rounded-[11px] shadow-none" />
          <span className="truncate">Tsuzuku · ta watchlist, en continu</span>
        </div>
        <span className="shrink-0">{publicPage ? "Liste partagée" : "Anime list personnelle"}</span>
      </div>
    </footer>
  );
}
