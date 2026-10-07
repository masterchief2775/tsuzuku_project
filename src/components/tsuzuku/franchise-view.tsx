import { AlertTriangle, BookMarked, ChevronDown, Loader2, Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Cover } from "@/components/tsuzuku/cover";
import { useFranchises } from "@/components/tsuzuku/use-franchises";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/watchlist";
import { splitMembersForDisplay } from "@/lib/franchise";
import type { Franchise, FranchiseMemberView } from "@/lib/franchise";
import { useWatchlistStore } from "@/store/watchlist-store";

/**
 * Franchises & watch order.
 *
 * Shows, per franchise, the recommended order, what the user already has, and
 * the two actionable findings: a prerequisite they do not have at all, and an
 * earlier entry they never started. Orders AniList does not define are labelled
 * "estimated" so a guess is never presented as fact.
 */

function MemberRow({ member, position }: { member: FranchiseMemberView; position: number }) {
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);
  const status = member.status ? statusMeta(member.status) : null;

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-dim">
        {position + 1}
      </span>
      {member.missing ? (
        <div
          aria-hidden="true"
          className="h-9 w-6.5 shrink-0 rounded-[6px] border border-dashed border-line bg-bg/40"
        />
      ) : (
        <Cover
          src={member.image}
          title={member.title}
          className="h-9 w-6.5 shrink-0 rounded-[6px]"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px]",
          member.missing && "text-dim italic",
        )}
      >
        {member.title}
      </span>
      {member.missing ? (
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold text-dim">
          pas dans ta liste
        </span>
      ) : status ? (
        <button
          type="button"
          onClick={() => setActiveEntryId(findEntryId(member.id))}
          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
          style={{ background: status.color, color: "var(--color-bg)" }}
        >
          {status.label}
        </button>
      ) : null}
    </li>
  );
}

function findEntryId(anilistId: number): string | null {
  return useWatchlistStore.getState().entries.find((e) => e.anilistId === anilistId)?.id ?? null;
}

function FranchiseCard({ franchise }: { franchise: Franchise }) {
  const verified = franchise.orderSource === "verified";
  const total = franchise.members.length;
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = splitMembersForDisplay(franchise);
  const shown = expanded ? franchise.members : visible;

  return (
    <li className="rounded-[14px] border border-line bg-raised p-4">
      <div className="flex items-start gap-3">
        <Cover
          src={franchise.image}
          title={franchise.name}
          className="h-14 w-10 shrink-0 rounded-[8px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-serif text-[15px] font-semibold">{franchise.name}</h3>
            <span className="text-[11.5px] text-dim tabular-nums">
              {franchise.owned}/{total} dans ta liste
            </span>
          </div>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-dim">
            {verified ? (
              <>
                <ShieldCheck className="size-3.5 text-lime" />
                ordre vérifié
              </>
            ) : (
              <>
                <Network className="size-3.5" />
                ordre estimé (relations AniList)
              </>
            )}
          </p>
        </div>
      </div>

      {franchise.missingPrerequisites.length > 0 ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[12px] text-amber-100">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Préalable manquant :{" "}
            <strong className="font-bold">
              {franchise.missingPrerequisites.map((m) => m.title).join(", ")}
            </strong>
          </span>
        </p>
      ) : null}

      {franchise.outOfOrder.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-[10px] border border-crimson/30 bg-crimson/10 px-2.5 py-2 text-[12px] text-crimson">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Tu as commencé <strong className="font-bold">{franchise.outOfOrder[0]?.watched.title}</strong>{" "}
            avant <strong className="font-bold">{franchise.outOfOrder[0]?.skipped.title}</strong>.
          </span>
        </p>
      ) : null}

      <ol className="mt-3 divide-y divide-line/60">
        {shown.map((member) => (
          <MemberRow key={member.id} member={member} position={member.position} />
        ))}
      </ol>

      {hidden.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line px-3 text-[12.5px] font-medium text-dim transition-colors hover:border-lime/40 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded
            ? "Réduire"
            : `${hidden.length} autre${hidden.length > 1 ? "s" : ""} titre${hidden.length > 1 ? "s" : ""} de la franchise`}
        </button>
      ) : null}
    </li>
  );
}

export function FranchiseView() {
  const { franchises, loading, pendingCount, error } = useFranchises();

  const gaps = franchises.reduce((n, f) => n + f.missingPrerequisites.length, 0);
  const mistakes = franchises.reduce((n, f) => n + f.outOfOrder.length, 0);

  return (
    <div>
      <header className="mb-4">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Franchises</h2>
        <p className="mt-1 text-[13px] text-dim">
          {franchises.length === 0
            ? "Aucune franchise détectée pour l’instant."
            : `${franchises.length} franchise${franchises.length > 1 ? "s" : ""} détectée${franchises.length > 1 ? "s" : ""}.`}
          {gaps > 0 ? ` ${gaps} préalable${gaps > 1 ? "s" : ""} manquant${gaps > 1 ? "s" : ""}.` : ""}
          {mistakes > 0 ? ` ${mistakes} visionnage${mistakes > 1 ? "s" : ""} hors ordre.` : ""}
        </p>
        <p className="mt-1 text-[12px] text-dim/80">
          AniList décrit les liens entre titres mais ne publie pas l’ordre de visionnage : sans
          donnée vérifiée, l’ordre est déduit et signalé comme estimé.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-crimson">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-dim">
          <Loader2 className="size-4 animate-spin" />
          Analyse des relations AniList…
        </p>
      ) : null}

      {pendingCount > 0 && !loading ? (
        <p className="mb-3 text-[12px] text-dim">
          Relations en cours pour {pendingCount} titre{pendingCount > 1 ? "s" : ""} — la liste
          ci-dessous est encore partielle.
        </p>
      ) : null}

      {franchises.length === 0 && !loading ? (
        <div className="rounded-[14px] border border-dashed border-line px-4 py-14 text-center">
          <BookMarked className="mx-auto mb-3 size-6 text-dim" aria-hidden="true" />
          <p className="text-sm text-dim">
            {pendingCount > 0
              ? "Lecture des relations en cours…"
              : "Ajoute au moins deux titres liés pour voir apparaître leur franchise ici."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {franchises.map((f) => (
            <FranchiseCard key={f.key} franchise={f} />
          ))}
        </ul>
      )}
    </div>
  );
}