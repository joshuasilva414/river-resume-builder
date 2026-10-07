import { ArchiveSourceRequest } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { execute } from "~/server/services";
import { archiveSource, inspectSource, sourceDownload } from "~/server/sources";
import { retiredWorkspaceEndpoint } from "~/server/workspace-retired";
export const Route = createFileRoute("/api/v2/sources/$sourceId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        jsonResult(
          await execute(
            bindings(),
            request.headers,
            Effect.gen(function* () {
              const json = yield* readJson(request, 4096);
              const input = yield* Schema.decodeUnknownEffect(ArchiveSourceRequest)(json).pipe(
                Effect.mapError(
                  () =>
                    new ApplicationError({
                      code: "InvalidInput",
                      message:
                        "Provide the source, observed version, idempotency key, and trash state.",
                    }),
                ),
              );
              if (input.id !== params.sourceId)
                return yield* Effect.fail(
                  new ApplicationError({
                    code: "InvalidInput",
                    message: "The source must match the URL.",
                  }),
                );
              return yield* archiveSource(input);
            }),
            "source:write",
          ),
        ),
      GET: async ({ request, params }) => {
        const env = bindings();
        const url = new URL(request.url);
        if (url.searchParams.has("download")) {
          const result = await execute(
            env,
            request.headers,
            sourceDownload(env, params.sourceId),
            "source:read",
          );
          return result.ok ? result.value : jsonResult(result);
        }
        return jsonResult(
          await execute(
            env,
            request.headers,
            inspectSource(env, params.sourceId, url.searchParams.get("processingId") ?? undefined),
            "source:read",
          ),
        );
      },
      POST: () => retiredWorkspaceEndpoint(),
      PUT: () => retiredWorkspaceEndpoint(),
    },
  },
});
