import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/source-refinements/$taskId")({
  beforeLoad: () => {
    throw redirect({ to: "/archive", replace: true });
  },
});
