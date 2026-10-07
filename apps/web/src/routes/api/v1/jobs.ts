import { createFileRoute } from "@tanstack/react-router";
import { retiredWorkspaceEndpoint } from "~/server/workspace-retired";
export const Route = createFileRoute("/api/v1/jobs")({
  server: {
    handlers: {
      GET: retiredWorkspaceEndpoint,
      POST: retiredWorkspaceEndpoint,
      PATCH: retiredWorkspaceEndpoint,
      PUT: retiredWorkspaceEndpoint,
      DELETE: retiredWorkspaceEndpoint,
    },
  },
});
