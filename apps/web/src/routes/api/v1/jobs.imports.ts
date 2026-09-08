import { StartJobImportRequest } from "@river/contracts";
import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { startJobImport } from "~/server/job-import";
import { dispatchPending, execute, problem } from "~/server/services";

export const Route = createFileRoute("/api/v1/jobs/imports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = await Effect.runPromise(
          readJson(request, 512 * 1024).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(StartJobImportRequest)),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch(() => Effect.succeed({ ok: false as const })),
          ),
        );
        if (!parsed.ok)
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message: "Provide a posting URL or text, AI selection, and idempotency key.",
              }),
              newId(),
            ),
          });
        const env = bindings(),
          result = await execute(
            env,
            request.headers,
            startJobImport(env, parsed.value),
            "jobs:write",
          );
        if (result.ok) await dispatchPending(env).catch(() => {});
        return jsonResult(result, 202);
      },
    },
  },
});
