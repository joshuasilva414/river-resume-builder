import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { inspectEvidence } from "~/server/evidence";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
export const Route = createFileRoute("/api/v1/evidence/$claimId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        jsonResult(
          await execute(
            bindings(),
            request.headers,
            inspectEvidence(params.claimId),
            "evidence:read",
          ),
        ),
    },
  },
});
