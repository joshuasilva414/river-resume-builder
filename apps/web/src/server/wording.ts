import type {
  RetryWordingRequest,
  ReviewWordingRequest,
  StartWordingRequest,
} from "@river/contracts";
import { Effect } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
import { wordingProfile } from "./wording-provider";

export const startWording = (env: Env, input: StartWordingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.startWording(actor, input, env.WORDING_WORKFLOW ? wordingProfile(env) : null),
    );
  });
export const retryWording = (env: Env, input: RetryWordingRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.retryWording(actor, input, env.WORDING_WORKFLOW ? wordingProfile(env) : null),
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
      configured: Boolean(env.WORDING_WORKFLOW && wordingProfile(env)),
    };
  });
export const listWording = (env: Env, draftId: string, offset: number) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.listWording(actor.ownerId, draftId, offset));
    return { ...result, configured: Boolean(env.WORDING_WORKFLOW && wordingProfile(env)) };
  });
