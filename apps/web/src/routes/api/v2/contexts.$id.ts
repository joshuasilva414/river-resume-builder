import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { workspaceHttp } from "~/server/workspace";
export const Route = createFileRoute("/api/v2/contexts/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => workspaceHttp(request, bindings(), "context", params.id),
      POST: ({ request, params }) => workspaceHttp(request, bindings(), "context", params.id),
      DELETE: ({ request, params }) => workspaceHttp(request, bindings(), "context", params.id),
    },
  },
});
