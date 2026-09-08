import type {
  RetryWordingRequest,
  ReviewWordingBatchRequest,
  ReviewWordingRequest,
  StartWordingRequest,
} from "@river/contracts";
import { Effect } from "effect";
import {
  aiConfiguration,
  aiConnectionsAvailable,
  aiTaskConfigured,
  loadAiCredential,
} from "./ai-settings";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
import { wordingProfile } from "./wording-provider";

export const startWording = (env: Env, input: StartWordingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const configuration = yield* aiConfiguration(env, input.ai);
    return yield* attempt(() =>
      store.startWording(actor, input, env.WORDING_WORKFLOW ? wordingProfile(configuration) : null),
    );
  });
export const retryWording = (env: Env, input: RetryWordingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const captured = yield* attempt(() => store.inspectWording(actor.ownerId, input.id));
    yield* attempt(() =>
      loadAiCredential(env, store, actor.ownerId, captured.task.profile.connection),
    );
    const configuration = captured.task.profile;
    return yield* attempt(() =>
      store.retryWording(actor, input, env.WORDING_WORKFLOW ? configuration : null),
    );
  });
export const reviewWording = (input: ReviewWordingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewWording(actor, input));
  });
export const inspectWording = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectWording(actor.ownerId, id));
    return {
      ...detail,
      configured: Boolean(
        env.WORDING_WORKFLOW && (yield* aiTaskConfigured(env, detail.task.profile.connection)),
      ),
    };
  });
export const listWording = (env: Env, draftId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const connected = yield* aiConnectionsAvailable(env);
    const result = yield* attempt(() => store.listWording(actor.ownerId, draftId, offset));
    return {
      ...result,
      configured: Boolean(env.WORDING_WORKFLOW && connected),
    };
  });

export const reviewWordingBatch = (input: ReviewWordingBatchRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewWordingBatch(actor, input));
  });

export const pendingWording = (draftId: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const rows = yield* attempt(() => store.listPendingWording(actor.ownerId, draftId));
    return rows.map(({ input, ...row }) => ({
      ...row,
      original: input.target.content.wording,
      path: input.target.path,
      field: input.target.field,
    }));
  });
