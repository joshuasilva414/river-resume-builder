import { CreateSourceRequest } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { dispatchPending, execute } from "~/server/services";
import { createSource, listSources } from "~/server/sources";

export const Route = createFileRoute("/api/v1/sources")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        jsonResult(await execute(bindings(), request.headers, listSources, "source:read")),
      POST: async ({ request }) => {
        const env = bindings();
        const result = await execute(
          env,
          request.headers,
          Effect.gen(function* () {
            const json = yield* readJson(request);
            const input = yield* Schema.decodeUnknownEffect(CreateSourceRequest)(json).pipe(
              Effect.mapError(
                () =>
                  new ApplicationError({
                    code: "InvalidInput",
                    message: "Check the source title, format, provenance, and content.",
                  }),
              ),
            );
            return yield* createSource(env, input);
          }),
          "source:write",
        );
        if (result.ok) await dispatchPending(env).catch(() => {});
        return jsonResult(result, 201);
      },
    },
  },
});
