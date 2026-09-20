import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/checkpoints/$checkpointId")({
  beforeLoad: () => {
    throw redirect({ to: "/archive", replace: true });
  },
});
