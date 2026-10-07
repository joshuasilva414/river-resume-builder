import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/evidence")({
  beforeLoad: () => {
    throw redirect({ to: "/facts" });
  },
});
