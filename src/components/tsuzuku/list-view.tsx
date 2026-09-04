import { type ReactNode, useState } from "react";
import {
  CheckSquare,
  LayoutGrid,
  List as ListIcon,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { EntryCard, EntryRow } from "@/components/tsuzuku/entry-card";
import { collectFacets, filterEntries, STATUSES, type StatusKey } from "@/lib/watchlist";
import { cn } from "@/lib/utils";
import { useWatchlistStore, type SortId } from "@/store/watchlist-store";

export function ListView() {
  const entries = useWatchlistStore((s) => s.entries);
  const statusFilter = useWatchlistStore((s) => s.statusFilter);
  const sortBy = useWatchlistStore((s) => s.sortBy);
  const layout = useWatchlistStore((s) => s.layout);
  const listQuery = useWatchlistStore((s) => s.listQuery);
  const genreFilters = useWatchlistStore((s) => s.genreFilters);
  const yearFilters = useWatchlistStore((s) => s.yearFilters);
  const studioFilters = useWatchlistStore((s) => s.studioFilters);
  const tagFilters = useWatchlistStore((s) => s.tagFilters);
  const peopleFilters = useWatchlistStore((s) => s.peopleFilters);
  const setStatusFilter = useWatchlistStore((s) => s.setStatusFilter);
  const setSortBy = useWatchlistStore((s) => s.setSortBy);
  const setLayout = useWatchlistStore((s) => s.setLayout);
  const setListQuery = useWatchlistStore((s) => s.setListQuery);
  const toggleGenreFilter = useWatchlistStore((s) => s.toggleGenreFilter);
  const toggleYearFilter = useWatchlistStore((s) => s.toggleYearFilter);
  const toggleStudioFilter = useWatchlistStore((s) => s.toggleStudioFilter);
  const toggleTagFilter = useWatchlistStore((s) => s.toggleTagFilter);
  const togglePeopleFilter = useWatchlistStore((s) => s.togglePeopleFilter);
  const clearAdvancedFilters = useWatchlistStore((s) => s.clearAdvancedFilters);
  const setView = useWatchlistStore((s) => s.setView);
  const setActiveEntryId = useWatchlistStore((s) => s.setActiveEntryId);

  const selectionMode = useWatchlistStore((s) => s.selectionMode);
  const selectedIds = useWatchlistStore((s) => s.selectedIds);
  const setSelectionMode = useWatchlistStore((s) => s.setSelectionMode);
  const toggleSelected = useWatchlistStore((s) => s.toggleSelected);
  const selectAllVisible = useWatchlistStore((s) => s.selectAllVisible);
  const clearSelection = useWatchlistStore((s) => s.clearSelection);
  const bulkSetStatus = useWatchlistStore((s) => s.bulkSetStatus);
  const bulkRemove = useWatchlistStore((s) => s.bulkRemove);
  const bulkAddTag = useWatchlistStore((s) => s.bulkAddTag);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const facets = collectFacets(entries);
  const advancedCount =
    genreFilters.length + yearFilters.length + studioFilters.length + tagFilters.length + peopleFilters.length;
  const hasAdvanced = advancedCount > 0 || listQuery.trim().length > 0;

  let list = filterEntries(entries, {
    status: statusFilter,
    query: listQuery,
    genres: genreFilters,
    years: yearFilters,
    studios: studioFilters,
    tags: tagFilters,
    people: peopleFilters,
  });
  list = [...list].sort((a, b) => {
    if (sortBy === "updated") return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "progress") {
      const pa = a.totalEpisodes ? a.progress / a.totalEpisodes : 0;
      const pb = b.totalEpisodes ? b.progress / b.totalEpisodes : 0;
      return pb - pa;
    }
    return 0;
  });

  const allVisibleSelected =
    list.length > 0 && list.every((e) => selectedIds.includes(e.id));

  const onOpen = (id: string) => {
    if (selectionMode) {
      toggleSelected(id);
      return;
    }
    setActiveEntryId(id);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 rounded-[10px] border border-line bg-raised px-4 py-3 text-dim">
        <Search className="size-4 shrink-0" />
        <input
          id="list-search-input"
          value={listQuery}
          onChange={(ev) => setListQuery(ev.target.value)}
          placeholder="Filtrer par titre, tag ou avis…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          aria-label="Rechercher dans ma liste"
        />
        {listQuery ? (
          <button type="button" aria-label="Effacer" onClick={() => setListQuery("")}>
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={statusFilter === "Tous"} onClick={() => setStatusFilter("Tous")}>
            Tous
          </FilterPill>
          {STATUSES.map((s) => (
            <FilterPill
              key={s.key}
              active={statusFilter === s.key}
              accent={s.color}
              onClick={() => setStatusFilter(s.key)}
            >
              {s.label}
            </FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2.5 py-2 text-[12.5px] font-semibold",
              selectionMode ? "border-lime bg-lime/10 text-lime" : "border-line bg-raised text-dim",
            )}
            onClick={() => {
              if (selectionMode) clearSelection();
              else setSelectionMode(true);
            }}
          >
            <CheckSquare className="size-3.5" />
            {selectionMode ? "Annuler" : "Sélection"}
          </button>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2.5 py-2 text-[12.5px] font-semibold",
              filtersOpen || advancedCount > 0
                ? "border-lime bg-lime/10 text-lime"
                : "border-line bg-raised text-dim",
            )}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="size-3.5" />
            Filtres
            {advancedCount > 0 ? (
              <span className="rounded-full bg-lime px-1.5 text-[10px] font-extrabold text-bg">
                {advancedCount}
              </span>
            ) : null}
          </button>
          <select
            value={sortBy}
            onChange={(ev) => setSortBy(ev.target.value as SortId)}
            className="rounded-sm border border-line bg-raised px-2.5 py-2 text-[12.5px]"
            aria-label="Trier"
          >
            <option value="updated">Mis à jour récemment</option>
            <option value="title">Titre (A–Z)</option>
            <option value="rating">Note</option>
            <option value="progress">Progression</option>
          </select>
          <button
            type="button"
            className="rounded-sm border border-line bg-raised p-2"
            aria-label={layout === "grid" ? "Vue liste" : "Vue grille"}
            onClick={() => setLayout(layout === "grid" ? "list" : "grid")}
          >
            {layout === "grid" ? <ListIcon className="size-4" /> : <LayoutGrid className="size-4" />}
          </button>
        </div>
      </div>

      {selectionMode ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-lime/40 bg-lime/5 px-3 py-2.5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-dim"
            onClick={() =>
              allVisibleSelected
                ? selectAllVisible([])
                : selectAllVisible(list.map((e) => e.id))
            }
          >
            {allVisibleSelected ? (
              <CheckSquare className="size-4 text-lime" />
            ) : (
              <Square className="size-4" />
            )}
            {selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}
          </button>
          <select
            className="rounded-sm border border-line bg-raised px-2 py-1.5 text-[12px]"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as StatusKey | "";
              if (v) bulkSetStatus(v);
              e.target.value = "";
            }}
            disabled={selectedIds.length === 0}
          >
            <option value="" disabled>
              Changer le statut…
            </option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              bulkAddTag(tagDraft);
              setTagDraft("");
            }}
          >
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="Ajouter un tag"
              className="w-28 rounded-sm border border-line bg-raised px-2 py-1.5 text-[12px] outline-none sm:w-36"
              disabled={selectedIds.length === 0}
            />
            <button
              type="submit"
              disabled={selectedIds.length === 0 || !tagDraft.trim()}
              className="rounded-sm border border-line bg-raised px-2 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            >
              Tag
            </button>
          </form>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setConfirmDelete(true)}
            className="ml-auto flex items-center gap-1 rounded-sm border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-red-300 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            Supprimer
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4">
          <div className="w-full max-w-sm rounded-[12px] border border-line bg-raised p-5 shadow-xl">
            <p className="font-serif text-lg font-medium">Confirmer la suppression</p>
            <p className="mt-2 text-sm text-dim">
              Tu vas supprimer <strong className="text-ink">{selectedIds.length}</strong> entrée
              {selectedIds.length > 1 ? "s" : ""}. Cette action est définitive.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-[9px] border border-line px-3 py-2.5 text-sm font-semibold"
                onClick={() => setConfirmDelete(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="flex-1 rounded-[9px] bg-red-500 px-3 py-2.5 text-sm font-bold text-white"
                onClick={() => {
                  bulkRemove();
                  setConfirmDelete(false);
                }}
              >
                Supprimer {selectedIds.length}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="mb-5 space-y-3 rounded-lg border border-line bg-raised p-4">
          <FacetRow label="Genres" empty="Aucun genre pour l’instant">
            {facets.genres.map((g) => (
              <FilterPill key={g} active={genreFilters.includes(g)} onClick={() => toggleGenreFilter(g)}>
                {g}
              </FilterPill>
            ))}
          </FacetRow>
          <FacetRow label="Année" empty="Aucune année">
            {facets.years.map((y) => (
              <FilterPill key={y} active={yearFilters.includes(y)} onClick={() => toggleYearFilter(y)}>
                {String(y)}
              </FilterPill>
            ))}
          </FacetRow>
          <FacetRow label="Studio" empty="Aucun studio">
            {facets.studios.map((s) => (
              <FilterPill
                key={s}
                active={studioFilters.includes(s)}
                onClick={() => toggleStudioFilter(s)}
              >
                {s}
              </FilterPill>
            ))}
          </FacetRow>
          <FacetRow label="Tags" empty="Ajoute des tags sur une fiche pour filtrer ici">
            {facets.tags.map((t) => (
              <FilterPill key={t} active={tagFilters.includes(t)} onClick={() => toggleTagFilter(t)}>
                {t}
              </FilterPill>
            ))}
          </FacetRow>
          <FacetRow label="Vu avec (amis)" empty="Ajoute des amis sur une fiche pour filtrer ici">
            {facets.people.map((person) => (
              <FilterPill
                key={person}
                active={peopleFilters.includes(person)}
                onClick={() => togglePeopleFilter(person)}
              >
                {person}
              </FilterPill>
            ))}
          </FacetRow>
          {hasAdvanced ? (
            <button
              type="button"
              className="text-[12.5px] font-semibold text-dim underline-offset-2 hover:underline"
              onClick={clearAdvancedFilters}
            >
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 text-xs font-semibold text-dim">
        {list.length} titre{list.length === 1 ? "" : "s"}
        {list.length !== entries.length ? ` sur ${entries.length}` : ""}
      </div>

      {list.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="mb-4 text-sm text-dim">
            {entries.length === 0 ? "Rien ici pour l'instant." : "Aucun titre ne correspond."}
          </p>
          {entries.length === 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-[18px] py-[11px] text-sm font-bold text-bg"
              onClick={() => setView("search")}
            >
              <Search className="size-4" />
              Chercher un anime
            </button>
          ) : (
            <button
              type="button"
              className="text-sm font-semibold text-lime"
              onClick={() => {
                setStatusFilter("Tous");
                clearAdvancedFilters();
              }}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {list.map((e) => (
            <div key={e.id} className="relative">
              {selectionMode ? (
                <button
                  type="button"
                  className="absolute top-2 right-2 z-10 rounded-md bg-bg/90 p-1"
                  onClick={() => toggleSelected(e.id)}
                  aria-label="Sélectionner"
                >
                  {selectedIds.includes(e.id) ? (
                    <CheckSquare className="size-5 text-lime" />
                  ) : (
                    <Square className="size-5 text-dim" />
                  )}
                </button>
              ) : null}
              <div
                className={cn(
                  selectedIds.includes(e.id) && selectionMode ? "ring-2 ring-lime rounded-lg" : "",
                )}
              >
                <EntryCard entry={e} onOpen={onOpen} query={listQuery} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex items-stretch gap-2",
                selectedIds.includes(e.id) && selectionMode ? "ring-2 ring-lime rounded-[10px]" : "",
              )}
            >
              {selectionMode ? (
                <button
                  type="button"
                  className="shrink-0 self-center pl-1"
                  onClick={() => toggleSelected(e.id)}
                  aria-label="Sélectionner"
                >
                  {selectedIds.includes(e.id) ? (
                    <CheckSquare className="size-5 text-lime" />
                  ) : (
                    <Square className="size-5 text-dim" />
                  )}
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <EntryRow entry={e} onOpen={onOpen} query={listQuery} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FacetRow({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-semibold text-dim">{label}</div>
      {has ? (
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">{children}</div>
      ) : (
        <p className="text-[12px] text-dim/70">{empty}</p>
      )}
    </div>
  );
}

function FilterPill({
  active,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  accent?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
        active
          ? "border-lime bg-lime/15 text-lime"
          : "border-line bg-bg text-dim hover:border-lime/50",
      )}
      style={active && accent ? { borderColor: accent, color: accent } : undefined}
    >
      {children}
    </button>
  );
}
