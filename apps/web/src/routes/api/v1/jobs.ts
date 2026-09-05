import { JobCommand, JobSearch } from "@river/contracts";
import { ApplicationError, newId } from "@river/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { bindings } from "~/server/env";
import { jsonResult, readJson } from "~/server/http";
import { runJobCommand, searchJobs } from "~/server/jobs";
import { execute, problem } from "~/server/services";

const invalid = () =>
  jsonResult({
    ok: false,
    error: problem(
      new ApplicationError({
        code: "InvalidInput",
        message:
          "Provide valid job data, an observed revision, and an idempotency key for changes.",
      }),
      newId(),
    ),
  });
export const Route = createFileRoute("/api/v1/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        let input: JobSearch;
        try {
          input = Schema.decodeUnknownSync(JobSearch)({
            query: params.get("query") ?? "",
            archived: params.get("archived") === "true",
            offset: Number(params.get("offset") ?? 0),
          });
        } catch {
          return invalid();
        }
        return jsonResult(
          await execute(bindings(), request.headers, searchJobs(input), "jobs:read"),
        );
      },
      POST: async ({ request }) => {
        const parsed = await Effect.runPromise(
          readJson(request, 1024 * 1024).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(JobCommand)),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch(() => Effect.succeed({ ok: false as const })),
          ),
        );
        if (!parsed.ok) return invalid();
        return jsonResult(
          await execute(bindings(), request.headers, runJobCommand(parsed.value), "jobs:write"),
        );
      },
    },
  },
});
