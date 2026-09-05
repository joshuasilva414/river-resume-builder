import type {
  RetryTemplateAiRequest,
  ReviewTemplateAiRequest,
  StartTemplateAiRequest,
  TemplateAiList,
  TemplateConversationRequest,
} from "@river/contracts";
import { Effect } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
import { templateAiProfile } from "./template-ai-provider";

export const startTemplateAi = (env: Env, input: StartTemplateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.startTemplateAi(actor, input, env.TEMPLATE_AI_WORKFLOW ? templateAiProfile(env) : null),
    );
  });
export const previewTemplateAi = (input: StartTemplateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.previewTemplateAi(actor, input));
  });
export const retryTemplateAi = (env: Env, input: RetryTemplateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.retryTemplateAi(
        actor,
        input,
        env.TEMPLATE_AI_WORKFLOW ? templateAiProfile(env) : null,
        Boolean(env.TEMPLATE_AI_WORKFLOW),
      ),
    );
  });
export const reviewTemplateAi = (input: ReviewTemplateAiRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewTemplateAi(actor, input));
  });
export const inspectTemplateAi = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const value = yield* attempt(() => store.inspectTemplateAi(actor.ownerId, id));
    return {
      ...value,
      configured: Boolean(env.TEMPLATE_AI_WORKFLOW && templateAiProfile(env)),
      previewConfigured: Boolean(env.TEMPLATE_AI_WORKFLOW),
    };
  });
export const listTemplateAi = (env: Env, input: TemplateAiList) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const value = yield* attempt(() => store.listTemplateAi(actor.ownerId, input));
    return { ...value, configured: Boolean(env.TEMPLATE_AI_WORKFLOW && templateAiProfile(env)) };
  });
export const readTemplateConversation = (env: Env, input: TemplateConversationRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const value = yield* attempt(() => store.readTemplateConversation(actor.ownerId, input));
    return { ...value, configured: Boolean(env.TEMPLATE_AI_WORKFLOW && templateAiProfile(env)) };
  });
