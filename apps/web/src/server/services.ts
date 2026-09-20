import type { ProblemDetails } from "@river/contracts";
import { createRepository, type Repository, usageFailure } from "@river/db";
import type { Principal } from "@river/domain";
import { type AgentScope, ApplicationError, newId } from "@river/domain";
import { Context, Effect, Layer } from "effect";
import { authenticatePrincipal } from "./auth";
import { withDiagnostics } from "./diagnostics";
import type { Env } from "./env";
export class Store extends Context.Service<Store, Repository>()("river/Store") {}
export class Actor extends Context.Service<Actor, Principal>()("river/Actor") {}

export function attempt<A>(run: () => Promise<A>): Effect.Effect<A, ApplicationError> {
  return Effect.tryPromise({
    try: run,
    catch: (error) =>
      error instanceof ApplicationError
        ? error
        : (usageFailure(error) ??
          new ApplicationError({
            code: "Internal",
            message: "The operation could not be completed.",
          })),
  });
}

export function problem(error: ApplicationError, traceId: string): ProblemDetails {
  const statuses = {
    Unauthorized: 401,
    Forbidden: 403,
    InvalidInput: 400,
    Conflict: 409,
    NotFound: 404,
    Unavailable: 503,
    RateLimited: 429,
    Internal: 500,
  } as const;
  return {
    type: `urn:river:problem:${error.code}`,
    title: error.message,
    status: statuses[error.code],
    code: error.code,
    traceId,
    expectedRevision: error.expectedRevision,
    observedRevision: error.observedRevision,
  };
}

export async function execute<A>(
  env: Env,
  headers: Headers,
  program: Effect.Effect<A, ApplicationError, Store | Actor>,
  permission: AgentScope | "owner" | "identity" = "owner",
): Promise<{ ok: true; value: A } | { ok: false; error: ProblemDetails }> {
  const traceId = newId();
  const actor = await authenticatePrincipal(env, headers);
  const authorized = Effect.gen(function* () {
    if (!actor)
      return yield* Effect.fail(
        new ApplicationError({ code: "Unauthorized", message: "Sign in to your workspace." }),
      );
    if (
      actor.kind === "agent" &&
      permission !== "identity" &&
      (permission === "owner" || !actor.scopes.includes(permission))
    )
      return yield* Effect.fail(
        new ApplicationError({
          code: "Forbidden",
          message: "This credential does not allow that action.",
        }),
      );
    return yield* program.pipe(
      Effect.provide(
        Layer.merge(Layer.succeed(Store, createRepository(env.DB)), Layer.succeed(Actor, actor)),
      ),
    );
  });
  return Effect.runPromise(
    authorized.pipe(
      withDiagnostics({ scope: "application", traceId, actorId: actor?.id ?? null, permission }),
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catchTag("ApplicationError", (error) =>
        Effect.succeed({ ok: false as const, error: problem(error, traceId) }),
      ),
    ),
  );
}

/** Only database backups need a background workflow. Browser documents never enter dispatch. */
export async function dispatchPending(env: Env) {
  if (!env.BACKUP_WORKFLOW) return;
  const store = createRepository(env.DB);
  for (const dispatch of await store.pendingDispatches()) {
    const operation = await store.getOperation(dispatch.operationId);
    if (!operation) continue;
    if (!["Pending", "Cancelled"].includes(operation.state)) {
      await store.markDispatched(operation.id, operation.state);
      continue;
    }
    await env.BACKUP_WORKFLOW.createBatch([
      { id: operation.id, params: { operationId: operation.id } },
    ]);
    if (operation.state === "Cancelled") {
      const instance = await env.BACKUP_WORKFLOW.get(operation.id);
      const status = await instance.status();
      if (!["complete", "errored", "terminated"].includes(status.status))
        await instance.terminate();
    }
    await store.markDispatched(operation.id, operation.state);
  }
}
export async function reconcileOperations(env: Env) {
  await dispatchPending(env);
  if (!env.BACKUP_WORKFLOW) return;
  const store = createRepository(env.DB);
  for (const operation of await store.activeOperations()) {
    const instance = await env.BACKUP_WORKFLOW.get(operation.id),
      status = await instance.status();
    const terminal = ["complete", "errored", "terminated"].includes(status.status),
      expired = Date.now() - operation.updatedAt > 10 * 60_000;
    if (!terminal && !expired) continue;
    if (!terminal) await instance.terminate();
    await store.updateOperation(operation.id, {
      state: "Failed",
      stage: "Database backup interrupted",
      failure:
        "The backup stopped before completion. Inspect the retained attempt before retrying.",
    });
  }
}
