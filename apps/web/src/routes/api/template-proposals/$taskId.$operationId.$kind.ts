import { createRepository } from "@river/db";
import { createFileRoute } from "@tanstack/react-router";
import { authenticate } from "~/server/auth";
import { bindings } from "~/server/env";

export const Route = createFileRoute("/api/template-proposals/$taskId/$operationId/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const env = bindings(),
          session = await authenticate(env, request.headers);
        if (!session) return new Response("Authentication required", { status: 401 });
        const kind = params.kind;
        if (kind !== "pdf" && kind !== "tex" && kind !== "text" && kind !== "report")
          return new Response("Artifact not found", { status: 404 });
        const detail = await createRepository(env.DB)
            .inspectTemplateAi(session.user.id, params.taskId)
            .catch(() => null),
          proposal = detail?.proposal;
        if (
          !proposal ||
          proposal.state === "Rejected" ||
          proposal.previewOperationId !== params.operationId ||
          !proposal.previewArtifacts
        )
          return new Response("Artifact not found", { status: 404 });
        if ((proposal.previewArtifacts.expiresAt ?? 0) <= Date.now())
          return new Response(
            "This synthetic preview expired. Render it again from the saved candidate.",
            { status: 410 },
          );
        const object = await env.ARTIFACTS.get(proposal.previewArtifacts[kind]);
        if (!object) return new Response("Artifact is temporarily unavailable", { status: 503 });
        const types = {
          pdf: "application/pdf",
          tex: "application/x-tex",
          text: "text/plain; charset=utf-8",
          report: "application/json",
        };
        return new Response(object.body, {
          headers: {
            "Content-Type": types[kind],
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="river-template-candidate.${kind === "text" ? "txt" : kind === "report" ? "json" : kind}"`,
          },
        });
      },
    },
  },
});
