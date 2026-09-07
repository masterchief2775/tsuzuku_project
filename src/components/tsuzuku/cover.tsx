import { useState } from "react";
import { cn } from "@/lib/utils";
import { hashHue, initialsFromTitle } from "@/lib/watchlist";

type CoverProps = {
  src?: string | null;
  title: string;
  className?: string;
  imgClassName?: string;
};

export function Cover({ src, title, className, imgClassName }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;
  const hue = hashHue(title);
  const initials = initialsFromTitle(title);

  return (
    <div
      className={cn("relative overflow-hidden bg-bg", className)}
      style={
        showPlaceholder
          ? {
              background: `linear-gradient(145deg, hsl(${hue} 28% 22%) 0%, hsl(${(hue + 40) % 360} 18% 14%) 100%)`,
            }
          : undefined
      }
    >
      {showPlaceholder ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-serif text-2xl font-medium tracking-tight text-ink/80">
            {initials}
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          className={cn("size-full object-cover object-top", imgClassName)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
