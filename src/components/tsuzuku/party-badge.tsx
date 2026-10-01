import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { useWatchlistStore } from "@/store/watchlist-store";
import { cn } from "@/lib/utils";

/**
 * Global "you're in a session" indicator (header). Visible from anywhere on
 * the site while at least one room is open and you're a member — clicking it
 * jumps back to the room. Disappears on its own when the host closes the room
 * (or you leave), via the background `refreshParties` poll.
 */
export function PartyBadge() {
  const parties = useWatchlistStore((s) => s.myParties);
  if (parties.length === 0) return null;
  const first = parties[0]!;
  return (
    <Link
      to="/party/$roomId"
      params={{ roomId: first.roomId }}
      className={cn(
        "inline-flex max-w-[220px] items-center gap-1.5 rounded-[10px] border border-lime/40",
        "bg-lime/10 px-2.5 py-2 text-xs font-semibold text-lime transition hover:bg-lime/20",
      )}
      title={
        parties.length > 1
          ? `${parties.length} sessions en cours — retour à « ${first.title} »`
          : `Retour à la session « ${first.title} »`
      }
      aria-label={
        parties.length > 1
          ? `${parties.length} sessions en cours, retourner à la session`
          : "Retourner à la session en cours"
      }
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-lime" />
      </span>
      <Clapperboard className="size-3.5 shrink-0" />
      <span className="truncate">
        Ép. {first.episode}
        {parties.length > 1 ? ` · +${parties.length - 1}` : ""}
      </span>
    </Link>
  );
}
