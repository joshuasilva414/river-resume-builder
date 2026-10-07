import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
import { readWorkspacePdf } from "~/server/workspace-exports";
export const Route = createFileRoute("/api/v2/exports/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const result = await execute(
          bindings(),
          request.headers,
          readWorkspacePdf(bindings(), params.id),
          "resumes:read",
        );
        if (!result.ok) return jsonResult(result);
        return new Response(result.value.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="river-resume.pdf"`,
          },
        });
      },
    },
  },
});
