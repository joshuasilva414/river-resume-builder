import {
  type BulkAddSourceEvidenceRequest,
  ExtractionResult,
  type RetrySourceAiRequest,
  type ReviewSourceCandidateRequest,
  type StartSourceAiRequest,
} from "@river/contracts";
import type { Repository } from "@river/db";
import { ApplicationError, canonicalJson, fingerprint } from "@river/domain";
import { Effect, Schema } from "effect";
import {
  aiConfiguration,
  aiConnectionsAvailable,
  aiTaskConfigured,
  loadAiCredential,
  resolveAiModel,
} from "./ai-settings";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
import { sourceAiProfile } from "./source-ai-provider";

/** The selected model is saved with the source, so extraction continues after the page closes. */
export async function queueProcessedSourceEvidence(
  env: Env,
  store: Repository,
  ownerId: string,
  sourceId: string,
  processingId: string,
) {
  const source = await store.getSource(ownerId, sourceId);
  if (
    !source?.extractionAi ||
    source.archivedAt !== null ||
    source.state !== "Ready" ||
    source.currentProcessingId !== processingId
  )
    return;
  const request: StartSourceAiRequest = {
    idempotencyKey: `automatic-source-evidence:${processingId}`,
    sourceId,
    processingId,
    revision: source.revision,
    focus: "",
    contexts: [],
    ai: source.extractionAi,
  };
  const replay = await store.replayCommand(
    ownerId,
    "start-source-ai",
    request.idempotencyKey,
    request,
  );
  if (replay) return replay;
  const profile = env.SOURCE_AI_WORKFLOW
    ? sourceAiProfile(await resolveAiModel(env, store, ownerId, source.extractionAi))
    : null;
  if (!profile)
    throw new ApplicationError({
      code: "Unavailable",
      message: "Choose an active personal AI connection to extract evidence.",
    });
  const processing = await store.getProcessingResult(ownerId, sourceId, processingId);
  const object = processing ? await env.ARTIFACTS.get(processing.objectKey) : null;
  if (!processing || !object) throw new Error("Extracted source unavailable.");
  const serialized = await object.text();
  if ((await fingerprint(serialized)) !== processing.digest)
    throw new Error("Extraction integrity check failed.");
  const extraction = Schema.decodeUnknownSync(ExtractionResult)(JSON.parse(serialized));
  return store.startSourceAi({ kind: "owner", id: ownerId, ownerId }, request, profile, extraction);
}

const loadExtraction = (env: Env, input: StartSourceAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const processing = yield* attempt(() =>
      store.getProcessingResult(actor.ownerId, input.sourceId, input.processingId),
    );
    if (!processing)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Processing result not found." }),
      );
    const extraction = yield* attempt(async () => {
      const object = await env.ARTIFACTS.get(processing.objectKey);
      if (!object)
        throw new ApplicationError({
          code: "Unavailable",
          message: "The exact extracted text is unavailable.",
        });
      const serialized = await object.text();
      if ((await fingerprint(serialized)) !== processing.digest)
        throw new ApplicationError({
          code: "Unavailable",
          message: "Extraction integrity could not be confirmed.",
        });
      return Schema.decodeUnknownSync(ExtractionResult)(JSON.parse(serialized));
    });
    return extraction;
  });
export const startSourceAi = (env: Env, input: StartSourceAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "start-source-ai", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const configuration = yield* aiConfiguration(env, input.ai);
    const profile = env.SOURCE_AI_WORKFLOW ? sourceAiProfile(configuration) : null;
    if (!profile)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message:
            "Evidence extraction is unavailable. Add evidence manually or choose an active personal AI connection.",
        }),
      );
    const extraction = yield* loadExtraction(env, input);
    return yield* attempt(() => store.startSourceAi(actor, input, profile, extraction));
  });
export const retrySourceAi = (env: Env, input: RetrySourceAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "retry-source-ai", input.idempotencyKey, input),
    );
    if (replay) return replay;
    const captured = yield* attempt(() => store.inspectSourceAi(actor.ownerId, input.id));
    yield* attempt(() =>
      loadAiCredential(env, store, actor.ownerId, captured.task.profile.connection),
    );
    const configuration = captured.task.profile;
    return yield* attempt(() =>
      store.retrySourceAi(actor, input, env.SOURCE_AI_WORKFLOW ? configuration : null),
    );
  });
export const reviewSourceCandidate = (input: ReviewSourceCandidateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewSourceCandidate(actor, input));
  });
export const addSourceEvidence = (input: BulkAddSourceEvidenceRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.addSourceEvidence(actor, input));
  });
export const inspectSourceAi = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.inspectSourceAi(actor.ownerId, id));
    return {
      ...result,
      task: {
        ...result.task,
        input: {
          ...result.task.input,
          source: { ...result.task.input.source, text: "" },
          sourceAnchors: [],
        },
      },
      configured: Boolean(
        env.SOURCE_AI_WORKFLOW && (yield* aiTaskConfigured(env, result.task.profile.connection)),
      ),
    };
  });
export const listSourceAi = (env: Env, sourceId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const connected = yield* aiConnectionsAvailable(env);
    const result = yield* attempt(() => store.listSourceAi(actor.ownerId, sourceId, offset));
    return {
      ...result,
      configured: Boolean(env.SOURCE_AI_WORKFLOW && connected),
    };
  });

export const previewSourceAi = (env: Env, input: StartSourceAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const extraction = yield* loadExtraction(env, input);
    const captured = yield* attempt(() => store.captureSourceAiInput(actor, input, extraction));
    const characters = canonicalJson(captured).length;
    return { characters, limit: 160000, allowed: characters <= 160000 };
  });
