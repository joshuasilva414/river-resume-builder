import type {
  RetrySourceRefinementRequest,
  ReviewSourceRefinementRequest,
  SourceRefinementList,
  StartSourceRefinementRequest,
} from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { Effect } from "effect";
import type { Env } from "./env";
import { readRefinementBase } from "./refinement-artifacts";
import { sourceRefinementProfile } from "./refinement-provider";
import { Actor, attempt, Store } from "./services";

export const startSourceRefinement = (env: Env, input: StartSourceRefinementRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "start-source-refinement", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const profile = env.SOURCE_REFINEMENT_WORKFLOW ? sourceRefinementProfile(env) : null;
    if (!profile)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "Source refinement is unavailable. Review and export remain available.",
        }),
      );
    const checkpoint = yield* attempt(() =>
      store.inspectCheckpoint(actor.ownerId, input.checkpointId),
    );
    if (
      checkpoint.operation?.id !== input.operationId ||
      checkpoint.operation.state !== "Succeeded" ||
      !checkpoint.operation.artifacts
    )
      return yield* Effect.fail(
        new ApplicationError({
          code: "Conflict",
          message: "Choose the exact saved checkpoint with a successful artifact set.",
        }),
      );
    const artifacts = checkpoint.operation.artifacts;
    const base = yield* attempt(() =>
      readRefinementBase(env.ARTIFACTS, input.operationId, artifacts),
    );
    return yield* attempt(() => store.startSourceRefinement(actor, input, base, profile));
  });
export const retrySourceRefinement = (env: Env, input: RetrySourceRefinementRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "retry-source-refinement", input.idempotencyKey, input),
    );
    if (replay) return replay;
    if (!env.SOURCE_REFINEMENT_WORKFLOW)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "The source document runtime is unavailable.",
        }),
      );
    return yield* attempt(() =>
      store.retrySourceRefinement(actor, input, sourceRefinementProfile(env)),
    );
  });
export const reviewSourceRefinement = (env: Env, input: ReviewSourceRefinementRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "review-source-refinement", input.idempotencyKey, input),
    );
    if (replay) return replay;
    if (input.decision === "Accepted" && !env.SOURCE_REFINEMENT_WORKFLOW)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message:
            "Checkpoint publication is temporarily unavailable. The reviewed candidate is preserved.",
        }),
      );
    return yield* attempt(() => store.reviewSourceRefinement(actor, input));
  });
export const inspectSourceRefinement = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectSourceRefinement(actor.ownerId, id));
    return {
      ...detail,
      configured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW && sourceRefinementProfile(env)),
      runtimeConfigured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW),
    };
  });
export const listSourceRefinements = (env: Env, input: SourceRefinementList) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.listSourceRefinements(actor.ownerId, input));
    return {
      ...result,
      configured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW && sourceRefinementProfile(env)),
      runtimeConfigured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW),
    };
  });
