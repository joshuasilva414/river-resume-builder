import { ApplicationError, newId } from "@river/domain";
import { importFactsSchema } from "@river/domain/workspace";
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { execute, problem } from "~/server/services";
import { importFacts } from "~/server/workspace-commands";
export const Route = createFileRoute("/api/v2/facts/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await Effect.runPromise(readJson(request).pipe(Effect.result));
        const parsed = body._tag === "Success" ? importFactsSchema.safeParse(body.success) : null;
        if (!parsed?.success)
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message: "Provide typed facts and contexts with an idempotency key.",
              }),
              newId(),
            ),
          });
        return jsonResult(
          await execute(bindings(), request.headers, importFacts(parsed.data), "facts:write"),
        );
      },
    },
  },
});
