import { EvidenceCommand, EvidenceSearch } from "@river/contracts";
import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { evidencePermissions, runEvidenceCommand, searchEvidence } from "~/server/evidence";
import { jsonResult, readJson } from "~/server/http";
import { execute, problem } from "~/server/services";

export const Route = createFileRoute("/api/v1/evidence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        let input: EvidenceSearch;
        try {
          input = Schema.decodeUnknownSync(EvidenceSearch)({
            query: params.get("query") ?? "",
            status: params.get("status") ?? "All",
            ...(params.get("type") ? { type: params.get("type") } : {}),
            archived: params.get("archived") === "all" ? null : params.get("archived") === "true",
            contextId: params.get("contextId"),
            offset: Number(params.get("offset") ?? 0),
          });
        } catch {
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message: "Check the evidence search filters.",
              }),
              newId(),
            ),
          });
        }
        return jsonResult(
          await execute(bindings(), request.headers, searchEvidence(input), "evidence:read"),
        );
      },
      POST: async ({ request }) => {
        const parsed = await Effect.runPromise(
          readJson(request, 1024 * 1024).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(EvidenceCommand)),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch(() => Effect.succeed({ ok: false as const })),
          ),
        );
        if (!parsed.ok)
          return jsonResult({
            ok: false,
            error: problem(
              new ApplicationError({
                code: "InvalidInput",
                message:
                  "Provide a valid evidence command, observed revision, and idempotency key.",
              }),
              newId(),
            ),
          });
        const env = bindings();
        return jsonResult(
          await execute(
            env,
            request.headers,
            runEvidenceCommand(env, parsed.value),
            evidencePermissions[parsed.value.type],
          ),
        );
      },
    },
  },
});
