import { createFileRoute } from "@tanstack/react-router";
import { retiredWorkspaceEndpoint } from "~/server/workspace-retired";
export const Route = createFileRoute("/api/v1/evidence/import")({
  server: {
    handlers: {
      GET: retiredWorkspaceEndpoint,
      POST: retiredWorkspaceEndpoint,
      PUT: retiredWorkspaceEndpoint,
      PATCH: retiredWorkspaceEndpoint,
      DELETE: retiredWorkspaceEndpoint,
    },
  },
});
