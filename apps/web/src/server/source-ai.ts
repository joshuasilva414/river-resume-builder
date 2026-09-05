import {
  ExtractionResult,
  type RetrySourceAiRequest,
  type ReviewSourceCandidateRequest,
  type StartSourceAiRequest,
} from "@river/contracts";
import { ApplicationError, canonicalJson, fingerprint } from "@river/domain";
import { Effect, Schema } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
import { sourceAiProfile } from "./source-ai-provider";

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
    const profile = env.SOURCE_AI_WORKFLOW ? sourceAiProfile(env) : null;
    if (!profile)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message:
            "Source claim assistance is unavailable. Create claims manually from exact passages.",
        }),
      );
    const extraction = yield* loadExtraction(env, input);
    return yield* attempt(() => store.startSourceAi(actor, input, profile, extraction));
  });
export const retrySourceAi = (env: Env, input: RetrySourceAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.retrySourceAi(actor, input, env.SOURCE_AI_WORKFLOW ? sourceAiProfile(env) : null),
    );
  });
export const reviewSourceCandidate = (input: ReviewSourceCandidateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewSourceCandidate(actor, input));
  });
export const inspectSourceAi = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.inspectSourceAi(actor.ownerId, id));
    return { ...result, configured: Boolean(env.SOURCE_AI_WORKFLOW && sourceAiProfile(env)) };
  });
export const listSourceAi = (env: Env, sourceId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.listSourceAi(actor.ownerId, sourceId, offset));
    return { ...result, configured: Boolean(env.SOURCE_AI_WORKFLOW && sourceAiProfile(env)) };
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
