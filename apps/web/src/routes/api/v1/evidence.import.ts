import { BulkAddSourceEvidenceRequest } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { execute } from "~/server/services";
import { addSourceEvidence } from "~/server/source-ai";

export const Route = createFileRoute("/api/v1/evidence/import")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        jsonResult(
          await execute(
            bindings(),
            request.headers,
            Effect.gen(function* () {
              const json = yield* readJson(request, 1024 * 1024);
              const input = yield* Schema.decodeUnknownEffect(BulkAddSourceEvidenceRequest)(
                json,
              ).pipe(
                Effect.mapError(
                  () =>
                    new ApplicationError({
                      code: "InvalidInput",
                      message: "Provide the reviewed extraction items and their observed versions.",
                    }),
                ),
              );
              return yield* addSourceEvidence(input);
            }),
            "evidence:write",
          ),
        ),
    },
  },
});
