import { useCallback, useRef, useState } from "react";
import { useFocusTrap } from "@/components/tsuzuku/use-focus-trap";

/**
 * In-app replacement for `window.confirm`: same one-line call shape
 * (`if (!(await confirm("…"))) return;`) but rendered as a real dialog —
 * themed, focus-trapped, Escape-aware, and non-blocking for the browser.
 * Render the returned `confirmDialog` once near the root of the component.
 */
export function useConfirmDialog() {
  const [pending, setPending] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const settle = useCallback((ok: boolean) => {
    // Resolving inside the updater is idempotent (a promise settles once),
    // so StrictMode double-invocation is harmless.
    setPending((p) => {
      if (p) p.resolve(ok);
      return null;
    });
  }, []);
  useFocusTrap(ref, pending != null, () => settle(false));

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        setPending({ message, resolve });
      }),
    [],
  );

  const confirmDialog = pending ? (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm"
      onClick={() => settle(false)}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-sm rounded-[12px] border border-line bg-raised p-5 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-dialog-title" className="font-serif text-lg font-medium">
          Confirmer
        </p>
        <p id="confirm-dialog-desc" className="mt-2 text-sm text-dim">
          {pending.message}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-[9px] border border-line px-3 py-2.5 text-sm font-semibold"
            onClick={() => settle(false)}
          >
            Annuler
          </button>
          <button
            type="button"
            className="flex-1 rounded-[9px] bg-crimson px-3 py-2.5 text-sm font-bold text-bg"
            onClick={() => settle(true)}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}
