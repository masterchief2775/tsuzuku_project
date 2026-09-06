import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-lime text-bg shadow-[0_8px_18px_color-mix(in_oklab,var(--color-lime)_22%,transparent)]",
        className,
      )}
      aria-hidden="true"
    >
      <Clapperboard className="size-[21px]" strokeWidth={2.4} />
    </span>
  );
}
