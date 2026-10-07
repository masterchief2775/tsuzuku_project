import type { ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw, TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  // Since @tanstack/react-router 1.170.x, `error` is typed `unknown`.
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string" && error
        ? error
        : "Une erreur inattendue est survenue.";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
      <span className="text-crimson" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Une erreur est survenue</h1>
      <p className="max-w-md text-sm break-words text-dim">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex items-center gap-2 rounded-[10px] bg-lime px-4 py-2 text-sm font-bold text-bg"
      >
        <RotateCcw className="size-4" />
        Réessayer
      </button>
    </main>
  );
}