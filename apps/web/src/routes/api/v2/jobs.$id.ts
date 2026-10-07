import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { jobsHttp } from "~/server/workspace-job-commands";
export const Route = createFileRoute("/api/v2/jobs/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => jobsHttp(request, bindings(), params.id),
      POST: ({ request, params }) => jobsHttp(request, bindings(), params.id),
    },
  },
});
