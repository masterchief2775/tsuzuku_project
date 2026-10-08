import { createFileRoute } from "@tanstack/react-router";
import { WatchPage } from "@/components/tsuzuku/watch-page";

export const Route = createFileRoute("/watch")({
  validateSearch: (search: Record<string, unknown>): { m?: string; ep?: string } => {
    const m = typeof search.m === "string" ? search.m : undefined;
    const ep = typeof search.ep === "string" ? search.ep : undefined;
    return { ...(m ? { m } : {}), ...(ep ? { ep } : {}) };
  },
  head: () => ({ meta: [{ title: "Lecteur · Tsuzuku" }] }),
  component: WatchRoute,
});

function WatchRoute() {
  return <WatchPage />;
}