import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { jobsHttp } from "~/server/workspace-job-commands";
export const Route = createFileRoute("/api/v2/jobs")({
  server: {
    handlers: {
      GET: ({ request }) => jobsHttp(request, bindings()),
      POST: ({ request }) => jobsHttp(request, bindings()),
    },
  },
});
