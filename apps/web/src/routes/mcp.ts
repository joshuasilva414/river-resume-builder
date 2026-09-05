import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { handleMcp } from "~/server/mcp";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcp(request, bindings()),
      GET: ({ request }) => handleMcp(request, bindings()),
      DELETE: ({ request }) => handleMcp(request, bindings()),
    },
  },
});
