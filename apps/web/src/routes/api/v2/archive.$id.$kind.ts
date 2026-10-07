import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "~/server/env";
import { jsonResult } from "~/server/http";
import { execute } from "~/server/services";
import { archiveFileKind, readArchivedFile } from "~/server/workspace-archive";
export const Route = createFileRoute("/api/v2/archive/$id/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const kind = archiveFileKind.safeParse(params.kind);
        if (!kind.success) return new Response("File unavailable", { status: 404 });
        const result = await execute(
          bindings(),
          request.headers,
          readArchivedFile(bindings(), params.id, kind.data),
        );
        if (!result.ok) return jsonResult(result);
        return new Response(result.value.object.body, {
          headers: {
            "Content-Type": result.value.type,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="river-archived.${kind.data === "text" ? "txt" : kind.data === "report" ? "json" : kind.data}"`,
          },
        });
      },
    },
  },
});
