import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { to?: string } => ({
    to: typeof search.to === "string" ? search.to : undefined,
  }),
  component: MessagesRoute,
});

function MessagesRoute() {
  return <AppShell />;
}
