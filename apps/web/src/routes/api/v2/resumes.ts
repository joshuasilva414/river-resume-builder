import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { workspaceHttp } from "~/server/workspace";
export const Route = createFileRoute("/api/v2/resumes")({
  server: {
    handlers: {
      GET: ({ request }) => workspaceHttp(request, bindings(), "resume"),
      POST: ({ request }) => workspaceHttp(request, bindings(), "resume"),
    },
  },
});
