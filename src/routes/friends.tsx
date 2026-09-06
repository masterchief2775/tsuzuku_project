import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tsuzuku/app-shell";

export const Route = createFileRoute("/friends")({
  component: FriendsRoute,
});

function FriendsRoute() {
  return <AppShell />;
}
