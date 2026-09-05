import { ResumeSourceRequest, RetrySourceRequest } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { dispatchPending, execute } from "~/server/services";
import { inspectSource, resumeSourceUpload, retrySource, sourceDownload } from "~/server/sources";

export const Route = createFileRoute("/api/v1/sources/$sourceId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const env = bindings();
        const result = await execute(
          env,
          request.headers,
          Effect.gen(function* () {
            const json = yield* readJson(request);
            const input = yield* Schema.decodeUnknownEffect(ResumeSourceRequest)(json).pipe(
              Effect.mapError(
                () =>
                  new ApplicationError({
                    code: "InvalidInput",
                    message: "Provide the source ID, revision, key, and original bytes.",
                  }),
              ),
            );
            if (input.id !== params.sourceId)
              return yield* Effect.fail(
                new ApplicationError({
                  code: "InvalidInput",
                  message: "The source ID must match the URL.",
                }),
              );
            return yield* resumeSourceUpload(env, input);
          }),
          "source:write",
        );
        if (result.ok) await dispatchPending(env).catch(() => {});
        return jsonResult(result);
      },
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
      POST: async ({ request, params }) => {
        const env = bindings();
        const result = await execute(
          env,
          request.headers,
          Effect.gen(function* () {
            const json = yield* readJson(request, 4096);
            const input = yield* Schema.decodeUnknownEffect(RetrySourceRequest)(json).pipe(
              Effect.mapError(
                () =>
                  new ApplicationError({
                    code: "InvalidInput",
                    message: "Provide the source ID, observed revision, and idempotency key.",
                  }),
              ),
            );
            if (input.id !== params.sourceId)
              return yield* Effect.fail(
                new ApplicationError({
                  code: "InvalidInput",
                  message: "The source ID must match the URL.",
                }),
              );
            return yield* retrySource(input);
          }),
          "source:write",
        );
        if (result.ok) await dispatchPending(env).catch(() => {});
        return jsonResult(result, 202);
      },
    },
  },
});
