import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  Dices,
  Home,
  Library,
  List,
  Menu,
  MessageCircle,
  Search,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useWatchlistStore, type ViewId } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "view"; id: ViewId; label: string; short: string; icon: LucideIcon }
  | { kind: "route"; to: "/friends" | "/lists" | "/messages"; label: string; short: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { kind: "view", id: "dashboard", label: "Accueil", short: "Home", icon: Home },
  { kind: "view", id: "list", label: "Ma liste", short: "Liste", icon: List },
  { kind: "route", to: "/friends", label: "Amis", short: "Amis", icon: Users },
  { kind: "route", to: "/lists", label: "Listes partagées", short: "Listes", icon: Library },
  { kind: "route", to: "/messages", label: "Messages", short: "Msg", icon: MessageCircle },
  { kind: "view", id: "season", label: "Saison", short: "Saison", icon: Clapperboard },
  { kind: "view", id: "roulette", label: "Roulette", short: "Dés", icon: Dices },
  { kind: "view", id: "search", label: "Rechercher", short: "Seek", icon: Search },
];

export function AppPrimaryNav({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useWatchlistStore((s) => s.view);
  const setView = useWatchlistStore((s) => s.setView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const onHome = pathname === "/" || pathname === "";

  return (
    <nav
      className={cn(
        "ui-panel flex max-w-full flex-col gap-1 p-1 sm:flex-row sm:overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="Navigation principale"
    >
      <button
        type="button"
        className="flex items-center justify-between rounded-[10px] px-2.5 py-2 text-xs font-semibold text-dim hover:bg-bg hover:text-ink sm:hidden"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
        aria-controls="primary-navigation-items"
      >
        <span className="flex items-center gap-2">
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          Menu
        </span>
        <span className="text-[11px] text-dim">{ITEMS.find((item) => {
          if (item.kind === "route") return pathname === item.to || pathname.startsWith(item.to + "/");
          return onHome && view === item.id;
        })?.short ?? "Navigation"}</span>
      </button>
      <div
        id="primary-navigation-items"
        className={cn(
          "max-w-full gap-1 sm:flex sm:flex-row sm:overflow-x-auto",
          mobileOpen ? "flex flex-col" : "hidden",
        )}
      >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.kind === "route"
            ? pathname === item.to || pathname.startsWith(item.to + "/")
            : onHome && view === item.id;

        const baseClass = cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:px-3 sm:text-[13px]",
          active
            ? "bg-lime text-bg shadow-[0_8px_18px_color-mix(in_oklab,var(--color-lime)_25%,transparent)]"
            : "text-dim hover:bg-bg hover:text-ink",
        );

        if (item.kind === "route") {
          return (
            <Link
              key={item.to}
              to={item.to}
              className={baseClass}
              title={item.label}
              onClick={() => setMobileOpen(false)}
            >
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
                setMobileOpen(false);
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
            onClick={() => {
              setMobileOpen(false);
              setView(item.id);
            }}
          >
            <Icon className="size-3.5 shrink-0 sm:size-4" />
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.short}</span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}
