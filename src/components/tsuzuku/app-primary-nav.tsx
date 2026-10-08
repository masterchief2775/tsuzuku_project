import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Clapperboard,
  Dices,
  GanttChart,
  Home,
  Network,
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
import { useBadgeCounts } from "@/lib/activity-client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "view"; id: ViewId; label: string; short: string; icon: LucideIcon }
  | { kind: "route"; to: "/friends" | "/lists" | "/messages"; label: string; short: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { kind: "view", id: "dashboard", label: "Accueil", short: "Accueil", icon: Home },
  { kind: "view", id: "list", label: "Ma liste", short: "Ma liste", icon: List },
  { kind: "route", to: "/friends", label: "Amis", short: "Amis", icon: Users },
  { kind: "route", to: "/lists", label: "Listes partagées", short: "Listes", icon: Library },
  { kind: "route", to: "/messages", label: "Messages", short: "Messages", icon: MessageCircle },
  { kind: "view", id: "calendar", label: "Calendrier", short: "Agenda", icon: CalendarDays },
  { kind: "view", id: "timeline", label: "Chronologie", short: "Chrono", icon: GanttChart },
  { kind: "view", id: "franchises", label: "Franchises", short: "Franch.", icon: Network },
  { kind: "view", id: "season", label: "Saison", short: "Saison", icon: Clapperboard },
  { kind: "view", id: "roulette", label: "Roulette", short: "Roulette", icon: Dices },
  { kind: "view", id: "search", label: "Rechercher", short: "Recherche", icon: Search },
];

export function AppPrimaryNav({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useWatchlistStore((s) => s.view);
  const setView = useWatchlistStore((s) => s.setView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onHome = pathname === "/" || pathname === "";
  // Shared cache: zero extra queries when NotificationsCenter already polls.
  const { unreadMessages } = useBadgeCounts(useCurrentUserState().user?.id);

  const isActive = (item: NavItem) =>
    item.kind === "route"
      ? pathname === item.to || pathname.startsWith(item.to + "/")
      : onHome && view === item.id;

  const currentLabel = ITEMS.find((item) => isActive(item))?.short ?? "Navigation";

  // The mobile panel floats above the page (it must never push content down).
  // Close it on outside tap and on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    panelRef.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const goView = (id: ViewId) => {
    setMobileOpen(false);
    if (onHome) {
      setView(id);
    } else {
      window.setTimeout(() => setView(id), 0);
    }
  };

  const renderItem = (item: NavItem, variant: "bar" | "overlay") => {
    const Icon = item.icon;
    const active = isActive(item);
    const overlay = variant === "overlay";

    const itemClass = cn(
      "flex items-center gap-1.5 rounded-[10px] font-semibold transition-all duration-200",
      overlay
        ? "min-h-12 gap-3 px-3 py-3 text-sm"
        : "shrink-0 px-2.5 py-1.5 text-xs sm:px-3 sm:text-[13px]",
      active
        ? "bg-lime text-bg shadow-[0_8px_18px_color-mix(in_oklab,var(--color-lime)_25%,transparent)]"
        : "text-dim hover:bg-bg hover:text-ink",
    );

    const content = (
      <>
        <Icon className={cn("shrink-0", overlay ? "size-5" : "size-3.5 sm:size-4")} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.kind === "route" && item.to === "/messages" && unreadMessages > 0 ? (
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
              active ? "bg-bg text-lime" : "bg-crimson text-bg",
            )}
            aria-label={`${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""}`}
          >
            {unreadMessages > 9 ? "9+" : unreadMessages}
          </span>
        ) : null}
      </>
    );

    if (item.kind === "route") {
      return (
        <Link
          key={item.to}
          to={item.to}
          className={cn(itemClass, "relative")}
          title={item.label}
          aria-current={active ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
        >
          {content}
        </Link>
      );
    }

    if (!onHome) {
      return (
        <Link
          key={item.id}
          to="/"
          className={itemClass}
          title={item.label}
          aria-current={active ? "page" : undefined}
          onClick={() => goView(item.id)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        className={cn(itemClass, overlay && "w-full text-left")}
        title={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => goView(item.id)}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label="Navigation principale" className={cn("relative", className)}>
      {/* Mobile: compact bar + floating overlay panel (never pushes content). */}
      <div className="sm:hidden">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[12px] border border-line bg-raised px-3.5 text-sm font-semibold text-ink transition hover:border-lime/40"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation-items"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {mobileOpen ? <X className="size-5 shrink-0" /> : <Menu className="size-5 shrink-0" />}
            <span className="truncate">{mobileOpen ? "Fermer" : "Menu"}</span>
          </span>
          <span className="shrink-0 rounded-full bg-lime/15 px-2.5 py-1 text-[11px] font-bold text-lime">
            {currentLabel}
          </span>
        </button>
      </div>

      {mobileOpen ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 outline-none sm:hidden"
        >
          <div
            id="primary-navigation-items"
            className="max-h-[70dvh] overflow-y-auto rounded-[14px] border border-line bg-raised p-2 shadow-2xl"
          >
            <div className="grid grid-cols-2 gap-1">
              {ITEMS.map((item) => renderItem(item, "overlay"))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop and up: wrapping pill row, no horizontal scrolling. */}
      <div className="ui-panel hidden max-w-full flex-row flex-wrap gap-1 p-1 sm:flex">
        {ITEMS.map((item) => renderItem(item, "bar"))}
      </div>
    </nav>
  );
}
