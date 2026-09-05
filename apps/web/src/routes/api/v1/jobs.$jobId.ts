import { InspectJobRequest } from "@river/contracts";
import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult } from "~/server/http";
import { inspectJob } from "~/server/jobs";
import { execute, problem } from "~/server/services";
export const Route = createFileRoute("/api/v1/jobs/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const query = new URL(request.url).searchParams;
        let input: InspectJobRequest;
        try {
          input = Schema.decodeUnknownSync(InspectJobRequest)({
            id: params.jobId,
            ...(query.has("snapshotId") ? { snapshotId: query.get("snapshotId") } : {}),
            ...(query.has("workspaceRevisionId")
              ? { workspaceRevisionId: query.get("workspaceRevisionId") }
              : {}),
          });
        } catch {
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message: "Check the job and history identifiers.",
              }),
              newId(),
            ),
          });
        }
        return jsonResult(
          await execute(bindings(), request.headers, inspectJob(input), "jobs:read"),
        );
      },
    },
  },
});
