import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  Compass,
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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useWatchlistStore, type ViewId } from "@/store/watchlist-store";
import { useBadgeCounts } from "@/lib/activity-client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

type NavItem =
  | { kind: "view"; id: ViewId; label: string; short: string; icon: LucideIcon }
  | { kind: "route"; to: "/friends" | "/lists" | "/messages"; label: string; short: string; icon: LucideIcon };

type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

const DASHBOARD: NavItem = { kind: "view", id: "dashboard", label: "Accueil", short: "Accueil", icon: Home };
const LIST: NavItem = { kind: "view", id: "list", label: "Ma liste", short: "Ma liste", icon: List };
const SEARCH: NavItem = { kind: "view", id: "search", label: "Rechercher", short: "Recherche", icon: Search };

const GROUPS: NavGroup[] = [
  {
    label: "Explorer",
    icon: Compass,
    items: [
      SEARCH,
      { kind: "view", id: "season", label: "Saison", short: "Saison", icon: Clapperboard },
      { kind: "view", id: "roulette", label: "Roulette", short: "Roulette", icon: Dices },
    ],
  },
  {
    label: "Suivi",
    icon: CalendarDays,
    items: [
      { kind: "view", id: "calendar", label: "Calendrier", short: "Agenda", icon: CalendarDays },
      { kind: "view", id: "timeline", label: "Chronologie", short: "Chrono", icon: GanttChart },
      { kind: "view", id: "franchises", label: "Franchises", short: "Franch.", icon: Network },
    ],
  },
  {
    label: "Social",
    icon: Users,
    items: [
      { kind: "route", to: "/friends", label: "Amis", short: "Amis", icon: Users },
      { kind: "route", to: "/lists", label: "Listes partagées", short: "Listes", icon: Library },
      { kind: "route", to: "/messages", label: "Messages", short: "Messages", icon: MessageCircle },
    ],
  },
];

/** Flat order for the mobile overlay grid (every destination stays one tap away). */
const ITEMS: NavItem[] = [
  DASHBOARD,
  LIST,
  ...GROUPS[2]!.items,
  ...GROUPS[1]!.items,
  { kind: "view", id: "season", label: "Saison", short: "Saison", icon: Clapperboard },
  { kind: "view", id: "roulette", label: "Roulette", short: "Roulette", icon: Dices },
  SEARCH,
];

const DROPDOWN_PANEL =
  "z-50 min-w-[230px] rounded-[12px] border border-line bg-raised p-1.5 shadow-xl";
const DROPDOWN_ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-sm outline-none transition hover:bg-bg focus:bg-bg";

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

  const unreadBadge = (active: boolean) =>
    unreadMessages > 0 ? (
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
          active ? "bg-bg text-lime" : "bg-crimson text-bg",
        )}
        aria-label={`${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""}`}
      >
        {unreadMessages > 9 ? "9+" : unreadMessages}
      </span>
    ) : null;

  /** Leaf content shared by the bar, the dropdowns and the mobile overlay. */
  const leafContent = (item: NavItem, active: boolean, large: boolean) => {
    const Icon = item.icon;
    return (
      <>
        <Icon className={cn("shrink-0", large ? "size-5" : "size-4")} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.kind === "route" && item.to === "/messages" ? unreadBadge(active) : null}
      </>
    );
  };

  /** One destination inside a desktop dropdown menu. */
  const dropdownLeaf = (item: NavItem) => {
    const active = isActive(item);
    const cls = cn(DROPDOWN_ITEM, active ? "bg-lime/15 font-semibold text-lime" : "text-ink");
    if (item.kind === "route" || !onHome) {
      return (
        <DropdownMenu.Item key={item.kind === "route" ? item.to : item.id} asChild>
          <Link
            to={item.kind === "route" ? item.to : "/"}
            className={cls}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (item.kind !== "route") goView(item.id);
            }}
          >
            {leafContent(item, active, false)}
          </Link>
        </DropdownMenu.Item>
      );
    }
    return (
      <DropdownMenu.Item
        key={item.id}
        className={cls}
        aria-current={active ? "page" : undefined}
        onSelect={() => goView(item.id)}
      >
        {leafContent(item, active, false)}
      </DropdownMenu.Item>
    );
  };

  const barPill = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-all duration-200",
      active
        ? "bg-lime text-bg shadow-[0_8px_18px_color-mix(in_oklab,var(--color-lime)_25%,transparent)]"
        : "text-dim hover:bg-bg hover:text-ink",
    );

  /** Top-level desktop entry: direct pill or grouped dropdown. */
  const renderBarEntry = (entry: NavItem | NavGroup, key: string) => {
    if (!("items" in entry)) {
      const active = isActive(entry);
      if (entry.kind === "route" || !onHome) {
        return (
          <Link
            key={key}
            to={entry.kind === "route" ? entry.to : "/"}
            className={barPill(active)}
            title={entry.label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (entry.kind !== "route") goView(entry.id);
            }}
          >
            {leafContent(entry, active, false)}
          </Link>
        );
      }
      return (
        <button
          key={key}
          type="button"
          className={barPill(active)}
          title={entry.label}
          aria-current={active ? "page" : undefined}
          onClick={() => goView(entry.id)}
        >
          {leafContent(entry, active, false)}
        </button>
      );
    }

    const groupActive = entry.items.some((item) => isActive(item));
    const GroupIcon = entry.icon;
    const showBadge = entry.label === "Social" && unreadMessages > 0;
    // Non-modal: a modal dropdown locks body scroll and compensates with a
    // padding-right, which visibly shoves the whole centered page left.
    return (
      <DropdownMenu.Root key={key} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              barPill(false),
              groupActive && "bg-lime/15 text-lime ring-1 ring-lime/30 hover:bg-lime/20 hover:text-lime",
            )}
            aria-label={`Menu ${entry.label}`}
          >
            <GroupIcon className="size-4 shrink-0" />
            <span>{entry.label}</span>
            <ChevronDown className="size-3.5 opacity-70" />
            {showBadge ? unreadBadge(groupActive) : null}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className={DROPDOWN_PANEL}>
            {entry.items.map((item) => dropdownLeaf(item))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  };

  /** Flat destination cell in the mobile overlay grid. */
  const renderOverlayItem = (item: NavItem) => {
    const active = isActive(item);
    const cls = cn(
      "flex min-h-12 items-center gap-3 rounded-[10px] px-3 py-3 text-sm font-semibold transition-all duration-200",
      active
        ? "bg-lime text-bg shadow-[0_8px_18px_color-mix(in_oklab,var(--color-lime)_25%,transparent)]"
        : "text-dim hover:bg-bg hover:text-ink",
    );
    if (item.kind === "route" || !onHome) {
      return (
        <Link
          key={item.kind === "route" ? item.to : item.id}
          to={item.kind === "route" ? item.to : "/"}
          className={cls}
          title={item.label}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            setMobileOpen(false);
            if (item.kind !== "route") goView(item.id);
          }}
        >
          {leafContent(item, active, true)}
        </Link>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        className={cn(cls, "w-full text-left")}
        title={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => goView(item.id)}
      >
        {leafContent(item, active, true)}
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
            <div className="grid grid-cols-2 gap-1">{ITEMS.map((item) => renderOverlayItem(item))}</div>
          </div>
        </div>
      ) : null}

      {/* Desktop and up: direct entries + grouped dropdowns, no scrolling. */}
      <div className="ui-panel hidden max-w-full flex-row flex-wrap items-center gap-1 p-1 sm:flex">
        {renderBarEntry(DASHBOARD, "dashboard")}
        {renderBarEntry(LIST, "list")}
        {GROUPS.map((group) => renderBarEntry(group, group.label))}
      </div>
    </nav>
  );
}
