import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  return <AppShell />;
}
