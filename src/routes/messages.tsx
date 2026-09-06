import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/messages")({ component: MessagesRoute });

function MessagesRoute() {
  return <AppShell />;
}
