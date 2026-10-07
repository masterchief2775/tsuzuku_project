import { useWatchlistStore } from "@/store/watchlist-store";

export function AppToast() {
  const toast = useWatchlistStore((s) => s.toast);
  const clearToast = useWatchlistStore((s) => s.clearToast);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-60 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-bg shadow-lg"
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          className="rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-bg"
          onClick={() => {
            toast.onAction?.();
            clearToast();
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
