import { ApplicationError, newId } from "@river/domain";
import { identitySchema, type JobTargetInput, jobTargetInputSchema } from "@river/domain/workspace";
import { Effect } from "effect";
import type { Env } from "./env";
import { jsonResult, readJson } from "./http";
import { Actor, attempt, execute, problem, Store } from "./services";
export const searchWorkspaceJobs = (query = "", archived = false) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listWorkspaceJobs(actor.ownerId, query, archived));
  });
export const inspectWorkspaceJob = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.getWorkspaceJob(actor.ownerId, id));
  });
export const saveJobTarget = (input: JobTargetInput) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.saveWorkspaceJob(actor, input));
  });
export async function jobsHttp(request: Request, env: Env, id?: string) {
  if (request.method === "GET") {
    if (id)
      return jsonResult(
        await execute(
          env,
          request.headers,
          inspectWorkspaceJob(identitySchema.parse(id)),
          "jobs:read",
        ),
      );
    return jsonResult(
      await execute(
        env,
        request.headers,
        searchWorkspaceJobs(
          new URL(request.url).searchParams.get("query")?.slice(0, 200) ?? "",
          new URL(request.url).searchParams.get("archived") === "true",
        ),
        "jobs:read",
      ),
    );
  }
  const body = await Effect.runPromise(readJson(request).pipe(Effect.result));
  if (body._tag === "Failure")
    return jsonResult({ ok: false, error: problem(body.failure, newId()) });
  const parsed = jobTargetInputSchema.safeParse(body.success);
  if (!parsed.success || (id && parsed.data.id !== id))
    return jsonResult({
      ok: false,
      error: problem(
        new ApplicationError({
          code: "InvalidInput",
          message:
            "Provide a typed job, selected fact IDs, observed revision, and idempotency key.",
        }),
        newId(),
      ),
    });
  return jsonResult(await execute(env, request.headers, saveJobTarget(parsed.data), "jobs:write"));
}
