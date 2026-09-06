import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/lists")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" && search.id.trim() ? search.id.trim() : undefined,
  }),
  component: ListsRoute,
});

function ListsRoute() {
  return <AppShell />;
}
