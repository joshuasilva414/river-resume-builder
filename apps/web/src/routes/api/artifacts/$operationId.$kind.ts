import { createRepository } from "@river/db";
import { createFileRoute } from "@tanstack/react-router";
import { authenticate } from "~/server/auth";
import { bindings } from "~/server/env";
export const Route = createFileRoute("/api/artifacts/$operationId/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const env = bindings();
        const session = await authenticate(env, request.headers);
        if (!session) return new Response("Authentication required", { status: 401 });
        const repository = createRepository(env.DB);
        const operation = await repository.getOperation(params.operationId);
        if (
          !operation ||
          operation.ownerId !== session.user.id ||
          !operation.artifacts ||
          !["Succeeded", "Failed"].includes(operation.state)
        )
          return new Response("Artifact not found", { status: 404 });
        if (
          "document" in operation.input &&
          operation.input.preview &&
          (operation.artifacts.expiresAt ?? operation.createdAt + 7 * 24 * 60 * 60 * 1000) <=
            Date.now()
        )
          return new Response("Preview expired. Request a fresh saved-draft preview.", {
            status: 410,
          });
        const kind = params.kind;
        if (kind !== "pdf" && kind !== "tex" && kind !== "text" && kind !== "report")
          return new Response("Artifact not found", { status: 404 });
        const download = new URL(request.url).searchParams.has("download");
        if (download && "document" in operation.input && operation.input.checkpointId) {
          const checkpoint = await repository.inspectCheckpoint(
            session.user.id,
            operation.input.checkpointId,
          );
          if (checkpoint.exported?.operationId !== operation.id)
            return new Response("Complete checkpoint review before downloading export files", {
              status: 403,
            });
        }
        const object = await env.ARTIFACTS.get(operation.artifacts[kind]);
        if (!object) return new Response("Artifact is temporarily unavailable", { status: 503 });
        const types = {
          pdf: "application/pdf",
          tex: "application/x-tex",
          text: "text/plain; charset=utf-8",
          report: "application/json",
        };
        const extensions = { pdf: "pdf", tex: "tex", text: "txt", report: "json" };
        return new Response(object.body, {
          headers: {
            "Content-Type": types[kind],
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="river-resume.${extensions[kind]}"`,
          },
        });
      },
    },
  },
});
