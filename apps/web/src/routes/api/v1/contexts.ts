import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { listContexts } from "~/server/evidence";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
export const Route = createFileRoute("/api/v1/contexts")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        jsonResult(await execute(bindings(), request.headers, listContexts, "evidence:read")),
    },
  },
});
