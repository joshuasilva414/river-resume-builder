import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
import { listSources } from "~/server/sources";
import { retiredWorkspaceEndpoint } from "~/server/workspace-retired";
export const Route = createFileRoute("/api/v1/sources")({
  server: {
    handlers: {
      GET: ({ request }) =>
        execute(bindings(), request.headers, listSources, "source:read").then(jsonResult),
      POST: retiredWorkspaceEndpoint,
    },
  },
});
