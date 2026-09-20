import { ApplicationError, newId } from "@river/domain";
import { extractedSourceSchema } from "@river/domain/workspace";
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { execute, problem } from "~/server/services";
import { storeExtractedSource } from "~/server/workspace-source-storage";
export const Route = createFileRoute("/api/v2/sources")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await Effect.runPromise(readJson(request).pipe(Effect.result));
        const parsed =
          body._tag === "Success" ? extractedSourceSchema.safeParse(body.success) : null;
        if (!parsed?.success)
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message:
                  "Provide extracted text, optional original bytes, and source metadata. File-only extraction is retired.",
              }),
              newId(),
            ),
          });
        return jsonResult(
          await execute(
            bindings(),
            request.headers,
            storeExtractedSource(bindings(), parsed.data),
            "source:write",
          ),
        );
      },
    },
  },
});
