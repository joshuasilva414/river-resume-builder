import type {
  CancelOperationRequest,
  OperationView,
  ProblemDetails,
  StartProofRequest,
} from "@river/contracts";
import { createRepository, type Repository, usageFailure } from "@river/db";
import {
  type AgentScope,
  ApplicationError,
  newId,
  type Principal,
  requireAdministrator,
} from "@river/domain";
import { syntheticResume } from "@river/templates";
import { Context, Effect, Layer } from "effect";
import { authenticatePrincipal } from "./auth";
import { withDiagnostics } from "./diagnostics";
import type { Configuration, Env } from "./env";

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

const requireRuntime = (environment: Configuration["ENVIRONMENT"]) =>
  Effect.gen(function* () {
    if (environment === "production")
      return yield* Effect.fail(
        new ApplicationError({
          code: "NotFound",
          message: "Document runtime is unavailable in production.",
        }),
      );
  });

export const startProof = (environment: Configuration["ENVIRONMENT"], input: StartProofRequest) =>
  Effect.gen(function* () {
    yield* requireRuntime(environment);
    const actor = yield* Actor;
    yield* attempt(async () => requireAdministrator(actor));
    const store = yield* Store;
    return yield* attempt(() =>
      store.startCompile(actor.id, input.idempotencyKey, {
        document: syntheticResume,
        theme: input.theme,
      }),
    );
  });

export const cancelOperation = (input: typeof CancelOperationRequest.Type) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    return yield* attempt(() =>
      store.cancelOperation(actor.id, input.operationId, input.idempotencyKey),
    );
  });

export const listOperations = (environment: Configuration["ENVIRONMENT"]) =>
  Effect.gen(function* () {
    yield* requireRuntime(environment);
    const actor = yield* Actor;
    yield* attempt(async () => requireAdministrator(actor));
    const store = yield* Store;
    const operations = yield* attempt(() => store.listOperations(actor.id));
    return operations
      .filter((operation) => "document" in operation.input)
      .map(
        (operation): OperationView => ({
          id: operation.id,
          state: operation.state,
          stage: operation.stage,
          createdAt: new Date(operation.createdAt).toISOString(),
          updatedAt: new Date(operation.updatedAt).toISOString(),
          failure: operation.failure,
          artifacts: operation.artifacts,
        }),
      );
  });

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

/** Rotate bounded checks so abandoned uploads or one R2 failure cannot starve later originals. */
export async function recoverSourceUploads(env: Pick<Env, "DB" | "ARTIFACTS">) {
  const repository = createRepository(env.DB);
  for (const source of await repository.uploadingSources()) {
    await Effect.runPromise(
      attempt(async () => {
        // Advance maintenance progress before I/O; source metadata and retry receipts stay unchanged.
        await repository.recordSourceUploadCheck(source.id);
        const object = await env.ARTIFACTS.head(source.objectKey);
        if (object?.size === source.byteLength && object.customMetadata?.sha256 === source.digest)
          await repository.finalizeSourceUpload(source.ownerId, source.id);
      }).pipe(
        withDiagnostics({
          scope: "source-upload-recovery",
          sourceId: source.id,
          ownerId: source.ownerId,
        }),
        Effect.exit,
      ),
    );
  }
}

/** Reconciliation retries durable dispatch after a commit, using the Operation's stable ID. */
export async function dispatchPending(env: Env) {
  const repository = createRepository(env.DB);
  const pending = await repository.pendingDispatches();
  await recoverSourceUploads(env);
  for (const dispatch of pending) {
    const operation = await repository.getOperation(dispatch.operationId);
    if (!operation) continue;
    if ("sourceId" in operation.input) {
      const source = await repository.getSource(operation.ownerId, operation.input.sourceId);
      if (!source || source.state === "Uploading") continue;
    }
    if (operation.state !== "Pending" && operation.state !== "Cancelled") {
      await repository.markDispatched(dispatch.operationId, operation.state);
      continue;
    }
    const workflow = workflowFor(env, operation.input);
    if (!workflow) continue;
    await Effect.runPromise(
      attempt(async () => {
        await workflow.createBatch([
          { id: dispatch.operationId, params: { operationId: dispatch.operationId } },
        ]);
        if (operation.state === "Cancelled") {
          const instance = await workflow.get(operation.id);
          const status = await instance.status();
          if (!["complete", "errored", "terminated"].includes(status.status))
            await instance.terminate();
        }
        await repository.markDispatched(dispatch.operationId, operation.state);
      }).pipe(
        withDiagnostics({
          scope: "workflow-dispatch",
          operationId: dispatch.operationId,
          ownerId: operation.ownerId,
        }),
      ),
    );
  }
}

/** Reconcile interrupted executions without replacing a completed result or an Owner cancellation. */
export async function reconcileOperations(env: Env) {
  await dispatchPending(env);
  const repository = createRepository(env.DB);
  for (const operation of await repository.activeOperations()) {
    const workflow = workflowFor(env, operation.input);
    if (!workflow) continue;
    const instance = await workflow.get(operation.id);
    const status = await instance.status();
    const terminal = ["complete", "errored", "terminated"].includes(status.status);
    const expired = Date.now() - operation.updatedAt > 10 * 60_000;
    if (!terminal && !expired) continue;
    if (!terminal) await instance.terminate();
    if ("type" in operation.input && operation.input.type === "checkpoint-score") {
      await repository.failScoring(operation.id, {
        code: "Interrupted",
        message:
          "Scoring stopped before publication. Any retained response is preserved for recovery; review this attempt before retrying.",
        retryAt: null,
      });
      continue;
    }
    if ("type" in operation.input && operation.input.type === "template-score") {
      await repository.failTemplateScoring(operation.id);
      continue;
    }
    await repository.failSource(
      operation.id,
      "Text extraction was interrupted. The original is preserved; retry extraction.",
    );
    await repository.updateOperation(operation.id, {
      state: "Failed",
      stage: "Background operation interrupted",
      failure:
        "type" in operation.input
          ? operation.input.type === "template-validation"
            ? "Template validation stopped before every fixture finished. Published results and the Draft are preserved; retry validation if attempts remain."
            : operation.input.type === "template-ai"
              ? "Template generation or preview was interrupted. Any saved candidate is preserved; inspect the task and retry the unfinished stage if attempts remain."
              : operation.input.type === "database-backup"
                ? "The daily backup was interrupted. Inspect its attempt in Settings before requesting a bounded retry."
                : "This analysis stopped before saving a proposal. Your input is preserved; retry analysis if attempts remain."
          : "This operation stopped before publishing its artifacts. Your input is preserved; compile again to retry.",
    });
  }
}

function workflowFor(
  env: Env,
  input: NonNullable<Awaited<ReturnType<Repository["getOperation"]>>>["input"],
) {
  if (!("type" in input)) return env.DOCUMENT_WORKFLOW;
  switch (input.type) {
    case "job-ai":
      return env.JOB_AI_WORKFLOW;
    case "source-ai":
      return env.SOURCE_AI_WORKFLOW;
    case "duplicate-ai":
      return env.DUPLICATE_AI_WORKFLOW;
    case "template-validation":
      return env.TEMPLATE_VALIDATION_WORKFLOW;
    case "template-ai":
      return env.TEMPLATE_AI_WORKFLOW;
    case "source-refinement":
    case "source-refinement-accept":
      return env.SOURCE_REFINEMENT_WORKFLOW;
    case "wording-ai":
      return env.WORDING_WORKFLOW;
    case "database-backup":
      return env.BACKUP_WORKFLOW;
    case "template-score":
      return env.TEMPLATE_SCORING_WORKFLOW;
    case "checkpoint-score":
      return env.SCORING_WORKFLOW;
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
