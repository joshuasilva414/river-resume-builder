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
        if (
          "type" in operation.input &&
          (operation.input.type === "source-refinement" ||
            operation.input.type === "source-refinement-accept")
        ) {
          const detail = await repository
            .inspectSourceRefinement(session.user.id, operation.input.taskId)
            .catch(() => null);
          if (!detail?.proposal || detail.proposal.state === "Rejected")
            return new Response("Artifact not found", { status: 404 });
          if (operation.input.type === "source-refinement") {
            if (detail.proposal.previewOperationId !== operation.id)
              return new Response("Artifact not found", { status: 404 });
            if ((operation.artifacts.expiresAt ?? 0) <= Date.now())
              return new Response("Source preview expired", { status: 410 });
            if (download)
              return new Response(
                "Accept the source proposal and review its checkpoint before exporting",
                { status: 403 },
              );
          } else {
            if (
              detail.proposal.state !== "Accepted" ||
              detail.proposal.acceptanceOperationId !== operation.id ||
              !detail.proposal.resultCheckpointId
            )
              return new Response("Artifact not found", { status: 404 });
            if (download) {
              const checkpoint = await repository.inspectCheckpoint(
                session.user.id,
                detail.proposal.resultCheckpointId,
              );
              if (checkpoint.exported?.operationId !== operation.id)
                return new Response("Complete checkpoint review before downloading export files", {
                  status: 403,
                });
            }
          }
        }
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
