import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { execute, problem } from "~/server/services";
import { archiveWorkspacePdf, uploadExportSchema } from "~/server/workspace-exports";
export const Route = createFileRoute("/api/v2/exports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await Effect.runPromise(
          readJson(request, 36 * 1024 * 1024).pipe(Effect.result),
        );
        const parsed = body._tag === "Success" ? uploadExportSchema.safeParse(body.success) : null;
        if (!parsed?.success)
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message:
                  "Provide a saved version, frozen rendering metadata, and matching PDF bytes (up to 25 MiB).",
              }),
              newId(),
            ),
          });
        return jsonResult(
          await execute(
            bindings(),
            request.headers,
            archiveWorkspacePdf(bindings(), parsed.data),
            "resumes:write",
          ),
        );
      },
    },
  },
});
