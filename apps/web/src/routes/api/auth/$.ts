import { createFileRoute } from "@tanstack/react-router";
import { createAuth } from "~/server/auth";
import { bindings } from "~/server/env";
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => createAuth(bindings()).handler(request),
      POST: ({ request }) => createAuth(bindings()).handler(request),
    },
  },
});
