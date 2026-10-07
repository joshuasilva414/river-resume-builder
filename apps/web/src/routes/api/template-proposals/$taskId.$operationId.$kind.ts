import { createFileRoute } from "@tanstack/react-router";
import { retiredWorkspaceEndpoint } from "~/server/workspace-retired";
export const Route = createFileRoute("/api/template-proposals/$taskId/$operationId/$kind")({
  server: { handlers: { GET: retiredWorkspaceEndpoint } },
});
