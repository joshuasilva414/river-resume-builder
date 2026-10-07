import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { workspaceHttp } from "~/server/workspace";
export const Route = createFileRoute("/api/v2/content/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => workspaceHttp(request, bindings(), "content", params.id),
      POST: ({ request, params }) => workspaceHttp(request, bindings(), "content", params.id),
      DELETE: ({ request, params }) => workspaceHttp(request, bindings(), "content", params.id),
    },
  },
});
