import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared page chrome. Every view renders one `PageHeader` (its `h1`), one
 * rhythm (`mb-5 sm:mb-6`), one eyebrow style — so the app reads as one product
 * instead of twelve screens that happen to share a palette.
 */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 sm:mb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11.5px] font-bold tracking-[0.14em] text-dim uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "font-serif text-2xl font-semibold tracking-tight text-balance sm:text-[28px] sm:leading-tight",
              eyebrow && "mt-1",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-dim">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Section heading inside a view: icon in a tinted chip, serif title, optional
 * count pill, optional right-aligned action. Keeps every `h2` on the same
 * baseline without forcing every section into the same shape.
 */
export function SectionTitle({
  icon: Icon,
  title,
  count,
  action,
  level = 2,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  count?: number;
  action?: ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      {Icon ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] border border-lime/25 bg-lime/10">
          <Icon className="size-3.5 text-lime" />
        </span>
      ) : null}
      <Tag className="font-serif min-w-0 flex-1 truncate text-[17px] font-medium text-balance">
        {title}
      </Tag>
      {count != null && count > 0 ? (
        <span className="shrink-0 rounded-full bg-lime/15 px-2 py-0.5 text-[11px] font-bold text-lime tabular-nums">
          {count}
        </span>
      ) : null}
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

/**
 * Every "nothing here" moment looks the same: dashed panel, icon medallion,
 * title, one hint line, and room for one or two actions. Icons default to an
 * inbox tray; pass a sharper one (SearchX, CalendarX, Users…) when the context
 * calls for it.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-dashed border-line bg-raised/40 px-5 py-8 text-center sm:py-10",
        className,
      )}
    >
      <span className="mx-auto grid size-11 place-items-center rounded-full border border-lime/25 bg-lime/10">
        <Icon className="size-5 text-lime" />
      </span>
      <p className="font-serif mt-3 text-[15px] font-medium text-balance">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-dim">{hint}</p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
