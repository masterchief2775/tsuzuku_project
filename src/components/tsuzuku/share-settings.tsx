import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { disableShare, enableShare, getShareSettings } from "@/lib/share";
import { useFocusTrap } from "@/components/tsuzuku/use-focus-trap";

export function ShareSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Traps Tab, closes on Escape, and returns focus to the button that opened it.
  useFocusTrap(panelRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    setError("");
    void (async () => {
      try {
        const s = await getShareSettings();
        setEnabled(s.enabled);
        setToken(s.token);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [open]);

  if (!open) return null;

  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : "";

  const toggle = async () => {
    setLoading(true);
    setError("");
    try {
      if (enabled) {
        await disableShare();
        setEnabled(false);
        setToken(null);
      } else {
        const s = await enableShare();
        setEnabled(true);
        setToken(s.token);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-[14px] border border-line bg-raised shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="share-title" className="font-serif text-lg font-medium">
            Liste publique
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-[8px] p-1.5 text-dim hover:bg-bg"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-dim">
            Partage un lien en lecture seule : titres, statuts, progression et notes.{" "}
            <strong className="text-ink">Sans</strong> avis personnels ni tags.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-bg/40 px-4 py-3">
            <span className="text-sm font-semibold">Activer le partage</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={loading}
              onClick={() => void toggle()}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                enabled ? "bg-lime" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-bg transition-transform ${
                  enabled ? "translate-x-5" : ""
                }`}
              />
            </button>
          </label>
          {enabled && shareUrl ? (
            <div className="space-y-2">
              <div className="break-all rounded-[9px] border border-line bg-bg px-3 py-2 text-[12px] text-dim">
                {shareUrl}
              </div>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] bg-lime px-4 py-2.5 text-sm font-bold text-bg"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copié" : "Copier le lien"}
              </button>
              <p className="text-[11.5px] text-dim">
                Désactiver le partage invalide immédiatement ce lien.
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-crimson">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
