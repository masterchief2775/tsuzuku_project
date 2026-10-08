import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import {
  detectAndParse,
  resolveAmbiguousStatus,
  type ImportPreview,
  type ParsedImportItem,
} from "@/lib/import-watchlist";
import {
  entryFromMedia,
  fetchMediaById,
  fetchMediaByMalId,
  type WatchlistEntry,
} from "@/lib/watchlist";
import { useWatchlistStore } from "@/store/watchlist-store";
import { useFocusTrap } from "@/components/tsuzuku/use-focus-trap";

type Phase = "idle" | "preview" | "importing" | "done";

type ImportResult = {
  added: number;
  skipped: number;
  unresolved: number;
  ambiguousMapped: number;
};

export function ImportView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useWatchlistStore((s) => s.entries);
  const applyImportedEntries = useWatchlistStore((s) => s.applyImportedEntries);
  const showToast = useWatchlistStore((s) => s.showToast);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Traps Tab, closes on Escape, and returns focus to the opener. Declared
  // before the `if (!open)` bail-out below to keep the hook order stable.
  useFocusTrap(panelRef, open, onClose);

  const reset = useCallback(() => {
    setPhase("idle");
    setPreview(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    abortRef.current = false;
  }, []);

  const handleClose = () => {
    abortRef.current = true;
    reset();
    onClose();
  };

  const readFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const p = detectAndParse(file.name, text);
      setPreview(p);
      setPhase("preview");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
    const file = ev.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const runImport = async () => {
    if (!preview) return;
    abortRef.current = false;
    setPhase("importing");
    const existingIds = new Set(entries.map((e) => e.anilistId));
    const toProcess = preview.items;
    setProgress({ done: 0, total: toProcess.length });

    let added = 0;
    let skipped = 0;
    let unresolved = 0;
    let ambiguousMapped = 0;
    const newEntries: WatchlistEntry[] = [];

    // Process sequentially with small concurrency to respect AniList rate limits
    const CONCURRENCY = 3;
    let index = 0;

    const processOne = async (item: ParsedImportItem) => {
      if (abortRef.current) return;

      let status = item.status;
      if (item.statusAmbiguous || !status) {
        status = resolveAmbiguousStatus(item.rawStatus);
        ambiguousMapped++;
      }

      let media = null as Awaited<ReturnType<typeof fetchMediaById>> | null;
      try {
        if (item.anilistId && !existingIds.has(item.anilistId)) {
          media = await fetchMediaById(item.anilistId);
        } else if (item.anilistId && existingIds.has(item.anilistId)) {
          skipped++;
          return;
        } else if (item.malId) {
          media = await fetchMediaByMalId(item.malId);
          if (media && existingIds.has(media.id)) {
            skipped++;
            return;
          }
        }
      } catch {
        unresolved++;
        return;
      }

      if (!media) {
        unresolved++;
        return;
      }

      existingIds.add(media.id);
      const entry = entryFromMedia(media);
      entry.status = status!;
      entry.progress = item.progress;
      if (item.score != null) entry.rating = item.score;
      if (item.totalEpisodes && !entry.totalEpisodes) entry.totalEpisodes = item.totalEpisodes;
      newEntries.push(entry);
      added++;
    };

    const workers: Promise<void>[] = [];
    for (let c = 0; c < CONCURRENCY; c++) {
      workers.push(
        (async () => {
          while (index < toProcess.length && !abortRef.current) {
            const i = index++;
            await processOne(toProcess[i]);
            setProgress({ done: Math.min(i + 1, toProcess.length), total: toProcess.length });
            // gentle pacing
            await new Promise((r) => setTimeout(r, 80));
          }
        })(),
      );
    }
    await Promise.all(workers);

    if (newEntries.length > 0) {
      applyImportedEntries(newEntries);
    }

    const res = { added, skipped, unresolved, ambiguousMapped };
    setResult(res);
    setPhase("done");
    showToast({
      message: `Import : ${added} ajouté${added > 1 ? "s" : ""}, ${skipped} ignoré${skipped > 1 ? "s" : ""}, ${unresolved} non reconnu${unresolved > 1 ? "s" : ""}`,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-line bg-raised shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="import-title" className="font-serif text-lg font-medium">
            Importer une liste
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-[8px] p-1.5 text-dim hover:bg-bg"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {phase === "idle" ? (
            <>
              <p className="text-sm text-dim">
                Dépose un export <strong className="text-ink">XML MyAnimeList</strong> ou un fichier{" "}
                <strong className="text-ink">JSON AniList</strong>. Les doublons (même id AniList)
                sont ignorés.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center gap-3 rounded-[12px] border-2 border-dashed px-4 py-10 transition-colors ${
                  dragOver ? "border-lime bg-lime/5" : "border-line bg-bg/40"
                }`}
              >
                <FileUp className="size-8 text-dim" />
                <p className="text-sm text-dim">Glisse un fichier ici</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-[9px] bg-lime px-4 py-2.5 text-sm font-bold text-bg"
                >
                  <Upload className="size-4" />
                  Choisir un fichier
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xml,.json,application/json,text/xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readFile(f);
                  }}
                />
              </div>
              {error ? <p className="text-sm text-crimson">{error}</p> : null}
            </>
          ) : null}

          {phase === "preview" && preview ? (
            <>
              <div className="rounded-[10px] border border-line bg-bg/50 p-4">
                <div className="font-serif text-3xl tabular-nums">{preview.counts.total}</div>
                <div className="text-xs text-dim">
                  titres détectés · source{" "}
                  {preview.source === "mal-xml" ? "MyAnimeList XML" : "AniList JSON"}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-dim">Statuts mappés</div>
                <ul className="space-y-1 text-sm">
                  {Object.entries(preview.counts.byStatus).map(([label, n]) => (
                    <li key={label} className="flex justify-between gap-2">
                      <span className={label.startsWith("Ambigu") ? "text-status-hold" : ""}>
                        {label}
                      </span>
                      <span className="tabular-nums text-dim">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {preview.counts.ambiguous > 0 ? (
                <p className="rounded-[8px] border border-status-hold/30 bg-status-hold/10 px-3 py-2 text-[12.5px] text-status-hold">
                  {preview.counts.ambiguous} statut{preview.counts.ambiguous > 1 ? "s" : ""} ambigu
                  {preview.counts.ambiguous > 1 ? "s" : ""} (ex. Rewatching) → mappé vers « En cours
                  » à la confirmation, plutôt que deviné silencieusement.
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-[9px] border border-line px-4 py-2.5 text-sm font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void runImport()}
                  className="flex-1 rounded-[9px] bg-lime px-4 py-2.5 text-sm font-bold text-bg"
                >
                  Confirmer l&apos;import
                </button>
              </div>
            </>
          ) : null}

          {phase === "importing" ? (
            <div className="space-y-3 py-4 text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-lime" />
              <p className="text-sm font-semibold">
                Import en cours… {progress.done}/{progress.total}
              </p>
              {progress.total > 50 ? (
                <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full bg-lime transition-all"
                    style={{
                      width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              ) : null}
              <p className="text-xs text-dim">Résolution AniList — ne ferme pas cette fenêtre</p>
            </div>
          ) : null}

          {phase === "done" && result ? (
            <div className="space-y-4">
              <p className="font-serif text-lg font-medium">Import terminé</p>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Ajoutés</span>
                  <span className="font-bold text-lime tabular-nums">{result.added}</span>
                </li>
                <li className="flex justify-between">
                  <span>Ignorés (déjà présents)</span>
                  <span className="tabular-nums text-dim">{result.skipped}</span>
                </li>
                <li className="flex justify-between">
                  <span>Non reconnus</span>
                  <span className="tabular-nums text-dim">{result.unresolved}</span>
                </li>
                {result.ambiguousMapped > 0 ? (
                  <li className="flex justify-between text-status-hold">
                    <span>Statuts ambigus mappés</span>
                    <span className="tabular-nums">{result.ambiguousMapped}</span>
                  </li>
                ) : null}
              </ul>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-[9px] bg-lime px-4 py-2.5 text-sm font-bold text-bg"
              >
                Terminer
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
