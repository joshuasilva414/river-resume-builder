import type {
  RetryDuplicateAiRequest,
  ReviewDuplicateAiRequest,
  StartDuplicateAiRequest,
} from "@river/contracts";
import { Effect } from "effect";
import {
  aiConfiguration,
  aiConnectionsAvailable,
  aiTaskConfigured,
  loadAiCredential,
} from "./ai-settings";
import { duplicateAiProfile } from "./duplicate-ai-provider";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
export const startDuplicateAi = (env: Env, input: StartDuplicateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const configuration = yield* aiConfiguration(env, input.ai);
    return yield* attempt(() =>
      store.startDuplicateAi(
        actor,
        input,
        env.DUPLICATE_AI_WORKFLOW ? duplicateAiProfile(configuration) : null,
      ),
    );
  });
export const previewDuplicateAi = (input: StartDuplicateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.previewDuplicateAi(actor, input));
  });
export const retryDuplicateAi = (env: Env, input: RetryDuplicateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const captured = yield* attempt(() => store.inspectDuplicateAi(actor.ownerId, input.id));
    yield* attempt(() =>
      loadAiCredential(env, store, actor.ownerId, captured.task.profile.connection),
    );
    const configuration = captured.task.profile;
    return yield* attempt(() =>
      store.retryDuplicateAi(actor, input, env.DUPLICATE_AI_WORKFLOW ? configuration : null),
    );
  });
export const reviewDuplicateAi = (input: ReviewDuplicateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewDuplicateAi(actor, input));
  });
export const inspectDuplicateAi = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const value = yield* attempt(() => store.inspectDuplicateAi(actor.ownerId, id));
    return {
      ...value,
      configured: Boolean(
        env.DUPLICATE_AI_WORKFLOW && (yield* aiTaskConfigured(env, value.task.profile.connection)),
      ),
    };
  });
export const listDuplicateAi = (env: Env, claimId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const connected = yield* aiConnectionsAvailable(env);
    const value = yield* attempt(() => store.listDuplicateAi(actor.ownerId, claimId, offset));
    return {
      ...value,
      configured: Boolean(env.DUPLICATE_AI_WORKFLOW && connected),
    };
  });
