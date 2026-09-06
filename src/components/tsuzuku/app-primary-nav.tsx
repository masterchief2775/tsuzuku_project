import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  Dices,
  Home,
  Library,
  List,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useWatchlistStore, type ViewId } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "view"; id: ViewId; label: string; short: string; icon: LucideIcon }
  | { kind: "route"; to: "/friends" | "/lists"; label: string; short: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { kind: "view", id: "dashboard", label: "Accueil", short: "Home", icon: Home },
  { kind: "view", id: "list", label: "Ma liste", short: "Liste", icon: List },
  { kind: "route", to: "/friends", label: "Amis", short: "Amis", icon: Users },
  { kind: "route", to: "/lists", label: "Listes partagées", short: "Listes", icon: Library },
  { kind: "view", id: "season", label: "Saison", short: "Saison", icon: Clapperboard },
  { kind: "view", id: "roulette", label: "Roulette", short: "Dés", icon: Dices },
  { kind: "view", id: "search", label: "Rechercher", short: "Seek", icon: Search },
];

export function AppPrimaryNav({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useWatchlistStore((s) => s.view);
  const setView = useWatchlistStore((s) => s.setView);
  const onHome = pathname === "/" || pathname === "";

  return (
    <nav
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-raised p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="Navigation principale"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.kind === "route"
            ? pathname === item.to || pathname.startsWith(item.to + "/")
            : onHome && view === item.id;

        const baseClass = cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-[13px]",
          active ? "bg-lime text-bg shadow-sm" : "text-dim hover:bg-bg hover:text-ink",
        );

        if (item.kind === "route") {
          return (
            <Link key={item.to} to={item.to} className={baseClass} title={item.label}>
              <Icon className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.short}</span>
            </Link>
          );
        }

        if (!onHome) {
          return (
            <Link
              key={item.id}
              to="/"
              className={baseClass}
              title={item.label}
              onClick={() => {
                window.setTimeout(() => setView(item.id), 0);
              }}
            >
              <Icon className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.short}</span>
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            className={baseClass}
            title={item.label}
            onClick={() => setView(item.id)}
          >
            <Icon className="size-3.5 shrink-0 sm:size-4" />
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.short}</span>
          </button>
        );
      })}
    </nav>
  );
}
