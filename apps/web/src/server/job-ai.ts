import type { RetryJobAiRequest, ReviewJobAiRequest, StartJobAiRequest } from "@river/contracts";
import { Effect } from "effect";
import {
  aiConfiguration,
  aiConnectionsAvailable,
  aiTaskConfigured,
  loadAiCredential,
} from "./ai-settings";
import type { Env } from "./env";
import { jobAiProfile } from "./job-ai-provider";
import { Actor, attempt, Store } from "./services";

export const startJobAi = (env: Env, input: StartJobAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const configuration = yield* aiConfiguration(env, input.ai);
    return yield* attempt(() =>
      store.startJobAi(
        actor,
        input,
        env.JOB_AI_WORKFLOW ? jobAiProfile(configuration, input.task) : null,
      ),
    );
  });
export const retryJobAi = (env: Env, input: RetryJobAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const captured = yield* attempt(() => store.inspectJobAi(actor.ownerId, input.id));
    yield* attempt(() =>
      loadAiCredential(env, store, actor.ownerId, captured.task.profile.connection),
    );
    const configuration = captured.task.profile;
    return yield* attempt(() =>
      store.retryJobAi(actor, input, env.JOB_AI_WORKFLOW ? configuration : null),
    );
  });
export const reviewJobAi = (input: ReviewJobAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewJobAi(actor, input));
  });
export const inspectJobAi = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectJobAi(actor.ownerId, id));
    return {
      ...detail,
      task: { ...detail.task, input: { ...detail.task.input, posting: "", postingAnchors: [] } },
      configured: Boolean(
        env.JOB_AI_WORKFLOW && (yield* aiTaskConfigured(env, detail.task.profile.connection)),
      ),
    };
  });
export const listJobAi = (env: Env, jobId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const connected = yield* aiConnectionsAvailable(env);
    const result = yield* attempt(() => store.listJobAi(actor.ownerId, jobId, offset));
    return {
      ...result,
      configured: {
        requirements: Boolean(env.JOB_AI_WORKFLOW && connected),
        ranking: Boolean(env.JOB_AI_WORKFLOW && connected),
      },
    };
  });
