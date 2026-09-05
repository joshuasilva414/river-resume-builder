import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { listDuplicates } from "~/server/evidence";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
export const Route = createFileRoute("/api/v1/duplicates")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        jsonResult(await execute(bindings(), request.headers, listDuplicates, "evidence:read")),
    },
  },
});
