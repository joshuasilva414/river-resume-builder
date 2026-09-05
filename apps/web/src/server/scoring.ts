import type {
  CaptureCheckpointRequest,
  CompareScoringRequest,
  RetryScoringRequest,
  ReviewScoringFindingRequest,
  ScoringHistoryRequest,
  StartScoringRequest,
} from "@river/contracts";
import type { Repository } from "@river/db";
import {
  ApplicationError,
  canonicalJson,
  scoringLimits,
  scoringPreflight,
  scoringProfile,
} from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  RENDERER_VERSION,
  SOURCE_RENDERER_VERSION,
} from "@river/templates";
import { Effect } from "effect";
import type { Env } from "./env";
import { readScoringText } from "./scoring-artifacts";
import { Actor, attempt, Store } from "./services";

export const scoringConfigured = (env: Env) =>
  Boolean(env.SCORING_WORKFLOW && env.ATS_SCREENER_ORIGIN);
function configuredProfile(env: Env) {
  if (!env.SCORING_WORKFLOW || !env.ATS_SCREENER_ORIGIN)
    throw new ApplicationError({
      code: "Unavailable",
      message: "Scoring is unavailable. Checkpoint review and export remain available.",
    });
  return scoringProfile(env.ATS_SCREENER_ORIGIN);
}
export const startCheckpointScoring = (env: Env, input: StartScoringRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "start-scoring", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const profile = yield* attempt(async () => configuredProfile(env));
    return yield* attempt(() => store.startScoring(actor, input, profile));
  });
export const saveAndScore = (env: Env, input: CaptureCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "capture-scored-checkpoint", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const profile = yield* attempt(async () => configuredProfile(env));
    return yield* attempt(() => store.captureCheckpoint(actor, input, undefined, profile));
  });
export const retryCheckpointScoring = (env: Env, input: RetryScoringRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "retry-scoring", input.idempotencyKey, input),
    );
    if (replay) return replay;
    if (!env.SCORING_WORKFLOW)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "The scoring runtime is unavailable.",
        }),
      );
    return yield* attempt(() => store.retryScoring(actor, input));
  });
export const inspectCheckpointScoring = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectScoring(actor, id));
    return { ...detail, run: scoringRunView(detail.run) };
  });
export const listCheckpointScoring = (input: ScoringHistoryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listScoring(actor, input));
  });
export const reviewFinding = (input: ReviewScoringFindingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewScoringFinding(actor, input));
  });
export const compareScores = (input: CompareScoringRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const comparison = yield* attempt(() => store.compareScoring(actor, input));
    return {
      ...comparison,
      before: scoringRunView(comparison.before),
      after: scoringRunView(comparison.after),
    };
  });
/** Unknown provider JSON crosses the server-function boundary as complete serialized text. */
function scoringRunView(run: Awaited<ReturnType<Repository["inspectScoring"]>>["run"]) {
  if (!run.result) return { ...run, result: null };
  const { raw, ...result } = run.result;
  return { ...run, result: { ...result, rawJson: canonicalJson(raw) } };
}
export const scoringContext = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectCheckpoint(actor.ownerId, id));
    const artifact = detail.operation?.artifacts;
    const renderer = detail.source
      ? SOURCE_RENDERER_VERSION
      : detail.checkpoint.templateGraph
        ? CUSTOM_RENDERER_VERSION
        : RENDERER_VERSION;
    const text =
      artifact && detail.operation?.state === "Succeeded"
        ? yield* attempt(
            async () =>
              (await readScoringText(env.ARTIFACTS, artifact).catch(() => null))?.resumeText ??
              null,
          )
        : null;
    return {
      configured: scoringConfigured(env),
      providerOrigin: env.ATS_SCREENER_ORIGIN ?? null,
      runtimeConfigured: Boolean(env.SCORING_WORKFLOW),
      checkpointId: id,
      revision: detail.state.revision,
      documentReady:
        text !== null &&
        artifact?.validationPassed === true &&
        artifact.rendererVersion === renderer &&
        artifact.templateIdentity === detail.checkpoint.templateIdentity &&
        !artifact.expiresAt,
      documentActive: Boolean(
        detail.operation && ["Pending", "Running"].includes(detail.operation.state),
      ),
      resumeText: text,
      jobDescription: detail.posting?.text ?? null,
      snapshotId: detail.checkpoint.snapshotId,
      preflight: scoringPreflight(text ?? "", detail.posting?.text ?? ""),
      limits: scoringLimits,
    };
  });
