import type { RetryJobImportRequest, StartJobImportRequest } from "@river/contracts";
import { Effect } from "effect";
import { aiConfiguration, loadAiCredential } from "./ai-settings";
import type { Env } from "./env";
import { jobAiProfile } from "./job-ai-provider";
import { publicPostingUrl } from "./job-import-retrieval";
import { Actor, attempt, Store } from "./services";

export const startJobImport = (env: Env, input: StartJobImportRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    if (input.input.url) yield* attempt(async () => publicPostingUrl(input.input.url ?? ""));
    const configuration = yield* aiConfiguration(env, input.ai);
    return yield* attempt(() =>
      store.startJobImport(
        actor,
        input,
        env.JOB_AI_WORKFLOW ? jobAiProfile(configuration, "extract-requirements") : null,
      ),
    );
  });
export const inspectJobImport = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectJobImport(actor.ownerId, id));
  });
export const retryJobImport = (env: Env, input: RetryJobImportRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectJobImport(actor.ownerId, input.id));
    yield* attempt(() =>
      loadAiCredential(env, store, actor.ownerId, detail.imported.profile.connection),
    );
    return yield* attempt(() => store.retryJobImport(actor, input));
  });
