import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/demo/visual-editor")({
  beforeLoad: () => {
    throw redirect({ to: "/templates", replace: true });
  },
});
