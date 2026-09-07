import type {
  RetrySourceRefinementRequest,
  ReturnToStructuredRequest,
  ReviewSourceRefinementRequest,
  SourceRefinementList,
  StartSourceRefinementRequest,
} from "@river/contracts";
import { ApplicationError } from "@river/domain";
import {
  compareSourceCandidate,
  compareSourceFields,
  completeTextDiff,
  structuredSourceFields,
} from "@river/templates/source-refinement";
import { Effect } from "effect";
import {
  aiConfiguration,
  aiConnectionsAvailable,
  aiTaskConfigured,
  loadAiCredential,
} from "./ai-settings";
import type { Env } from "./env";
import { readRefinementBase } from "./refinement-artifacts";
import { sourceRefinementProfile } from "./refinement-provider";
import { Actor, attempt, Store } from "./services";

export const startSourceRefinement = (env: Env, input: StartSourceRefinementRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const configuration = yield* aiConfiguration(env, input.ai);
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "start-source-refinement", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const profile = env.SOURCE_REFINEMENT_WORKFLOW ? sourceRefinementProfile(configuration) : null;
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
    const captured = yield* attempt(() => store.inspectSourceRefinement(actor.ownerId, input.id));
    if (!captured.proposal?.payload)
      yield* attempt(() =>
        loadAiCredential(env, store, actor.ownerId, captured.task.profile.connection),
      );
    const configuration = captured.task.profile;
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
    return yield* attempt(() => store.retrySourceRefinement(actor, input, configuration));
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
      task: {
        ...detail.task,
        input: {
          ...detail.task.input,
          checkpoint: { ...detail.task.input.checkpoint, source: "" },
        },
      },
      proposal: detail.proposal
        ? {
            ...detail.proposal,
            comparison: detail.proposal.comparison
              ? { ...detail.proposal.comparison, source: completeTextDiff("", "", "source") }
              : null,
            payload: detail.proposal.payload ? { ...detail.proposal.payload, source: "" } : null,
          }
        : null,
      sourceReview: detail.proposal?.payload
        ? {
            source: completeTextDiff("", "", "source"),
            fields:
              detail.proposal.comparison?.fields ??
              compareSourceFields(detail.task.input.checkpoint.fields, detail.proposal.payload),
          }
        : null,
      configured: Boolean(
        env.SOURCE_REFINEMENT_WORKFLOW &&
          (yield* aiTaskConfigured(env, detail.task.profile.connection)),
      ),
      runtimeConfigured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW),
    };
  });
export const listSourceRefinements = (env: Env, input: SourceRefinementList) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const connected = yield* aiConnectionsAvailable(env);
    const result = yield* attempt(() => store.listSourceRefinements(actor.ownerId, input));
    return {
      ...result,
      configured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW && connected),
      runtimeConfigured: Boolean(env.SOURCE_REFINEMENT_WORKFLOW),
    };
  });

export const inspectStructuredReturn = (env: Env, checkpointId: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectStructuredReturn(actor.ownerId, checkpointId));
    const eligibility = yield* attempt(() => store.inspectCheckpointBranch(actor, detail.base.id));
    const [original, accepted] = yield* attempt(() =>
      Promise.all([
        store.inspectCheckpoint(actor.ownerId, detail.base.id),
        store.inspectCheckpoint(actor.ownerId, checkpointId),
      ]),
    );
    const baseOperation = original.operation,
      acceptedOperation = accepted.operation,
      baseArtifacts = baseOperation?.artifacts,
      acceptedArtifacts = acceptedOperation?.artifacts;
    if (!baseOperation || !acceptedOperation || !baseArtifacts || !acceptedArtifacts)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message:
            "Both retained artifact sets are required to review the complete return-to-editor comparison.",
        }),
      );
    const [base, current] = yield* attempt(() =>
      Promise.all([
        readRefinementBase(env.ARTIFACTS, baseOperation.id, baseArtifacts),
        readRefinementBase(env.ARTIFACTS, acceptedOperation.id, acceptedArtifacts),
      ]),
    );
    const comparison = compareSourceCandidate(
      { ...base, fields: structuredSourceFields(detail.base.data, detail.base.graph) },
      {
        source: detail.source.source,
        fields: detail.source.fields,
        meaning: [],
        explanation: "All changes relative to the original structured checkpoint.",
      },
      current.extractedText,
    );
    return {
      ...detail,
      source: { ...detail.source, source: "" },
      comparison: { ...comparison, source: completeTextDiff("", "", "source") },
      templateIssue: eligibility.templateIssue,
      baseOperationId: baseOperation.id,
      acceptedOperationId: acceptedOperation.id,
    };
  });
export const returnToStructured = (input: ReturnToStructuredRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.returnToStructured(actor, input));
  });
