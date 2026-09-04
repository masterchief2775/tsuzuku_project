import { cn } from "@/lib/utils";

export function ProfileAvatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dims =
    size === "xs"
      ? "size-5 text-[9px]"
      : size === "sm"
        ? "size-8 text-xs"
        : size === "lg"
          ? "size-16 text-xl"
          : size === "xl"
            ? "size-24 text-3xl"
            : "size-10 text-sm";
  const letter = (name || "?").charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn("rounded-full object-cover border border-line bg-raised", dims, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-line bg-raised font-bold text-lime",
        dims,
        className,
      )}
      aria-hidden
    >
      {letter}
    </span>
  );
}
