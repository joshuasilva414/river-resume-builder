import type { RetryJobAiRequest, ReviewJobAiRequest, StartJobAiRequest } from "@river/contracts";
import { Effect } from "effect";
import type { Env } from "./env";
import { jobAiProfile } from "./job-ai-provider";
import { Actor, attempt, Store } from "./services";

export const startJobAi = (env: Env, input: StartJobAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.startJobAi(actor, input, env.JOB_AI_WORKFLOW ? jobAiProfile(env, input.task) : null),
    );
  });
export const retryJobAi = (env: Env, input: RetryJobAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectJobAi(actor.ownerId, input.id));
    return yield* attempt(() =>
      store.retryJobAi(
        actor,
        input,
        env.JOB_AI_WORKFLOW ? jobAiProfile(env, detail.task.input.task) : null,
      ),
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
      configured: Boolean(env.JOB_AI_WORKFLOW && jobAiProfile(env, detail.task.input.task)),
    };
  });
export const listJobAi = (env: Env, jobId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.listJobAi(actor.ownerId, jobId, offset));
    return {
      ...result,
      configured: {
        requirements: Boolean(env.JOB_AI_WORKFLOW && jobAiProfile(env, "extract-requirements")),
        ranking: Boolean(env.JOB_AI_WORKFLOW && jobAiProfile(env, "rank-evidence")),
      },
    };
  });
