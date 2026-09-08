import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});

function ProfileRoute() {
  return <AppShell />;
}
