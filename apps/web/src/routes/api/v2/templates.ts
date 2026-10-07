import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { workspaceHttp } from "~/server/workspace";
export const Route = createFileRoute("/api/v2/templates")({
  server: {
    handlers: {
      GET: ({ request }) => workspaceHttp(request, bindings(), "template"),
      POST: ({ request }) => workspaceHttp(request, bindings(), "template"),
    },
  },
});
