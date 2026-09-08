import { JobImportIdentity, RetryJobImportRequest } from "@river/contracts";
import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { inspectJobImport, retryJobImport } from "~/server/job-import";
import { dispatchPending, execute, problem } from "~/server/services";

const invalid = () =>
  jsonResult({
    ok: false,
    error: problem(
      new ApplicationError({
        code: "InvalidInput",
        message: "Provide a valid import identity, observed revision, and idempotency key.",
      }),
      newId(),
    ),
  });
export const Route = createFileRoute("/api/v1/jobs/imports/$importId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!Schema.is(JobImportIdentity)({ id: params.importId })) return invalid();
        return jsonResult(
          await execute(
            bindings(),
            request.headers,
            inspectJobImport(params.importId),
            "jobs:read",
          ),
        );
      },
      POST: async ({ request, params }) => {
        const parsed = await Effect.runPromise(
          readJson(request, 8192).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(RetryJobImportRequest)),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch(() => Effect.succeed({ ok: false as const })),
          ),
        );
        if (!parsed.ok || parsed.value.id !== params.importId) return invalid();
        const env = bindings(),
          result = await execute(
            env,
            request.headers,
            retryJobImport(env, parsed.value),
            "jobs:write",
          );
        if (result.ok) await dispatchPending(env).catch(() => {});
        return jsonResult(result, 202);
      },
    },
  },
});
