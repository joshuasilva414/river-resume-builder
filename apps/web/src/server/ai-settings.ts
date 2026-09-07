import type {
  RemoveAiConnectionRequest,
  SaveAiConnectionRequest,
  SaveWorkspacePreferencesRequest,
} from "@river/contracts";
import type { Repository } from "@river/db";
import {
  type AiConnectionBinding,
  type AiModelConfiguration,
  type AiSelection,
  ApplicationError,
  fingerprint,
} from "@river/domain";
import { Effect } from "effect";
import { decryptAiKey, encryptAiKey } from "./ai-credentials";
import { listProviderModels } from "./ai-models";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

/** Resolve only this owner's explicit selection or saved default. Never substitute a provider. */
export async function resolveAiModel(
  env: Pick<Env, "AI_CREDENTIAL_ENCRYPTION_KEY">,
  store: Repository,
  ownerId: string,
  selection?: AiSelection,
): Promise<AiModelConfiguration | null> {
  if (!env.AI_CREDENTIAL_ENCRYPTION_KEY) return null;
  const selected =
    selection ?? (await store.getWorkspacePreferences(ownerId)).preferences.defaultAi;
  if (!selected) return null;
  const connection = await store.getAiConnection(ownerId, selected.connectionId);
  if (!connection || connection.removedAt !== null || !connection.encryptedKey) return null;
  return {
    model: selected.model,
    connection: { id: connection.id, revision: connection.revision, provider: connection.provider },
  };
}

/** Called immediately before execution; removed or replaced credentials invalidate queued work. */
export async function loadAiCredential(
  env: Pick<Env, "AI_CREDENTIAL_ENCRYPTION_KEY">,
  store: Repository,
  ownerId: string,
  binding?: AiConnectionBinding,
) {
  const connection = binding ? await store.getAiConnection(ownerId, binding.id) : null;
  if (
    !binding ||
    !connection ||
    connection.removedAt !== null ||
    !connection.encryptedKey ||
    connection.revision !== binding.revision ||
    connection.provider !== binding.provider
  )
    throw new ApplicationError({
      code: "Unavailable",
      message:
        "This AI connection changed or was removed. Choose an active connection and start a new task.",
    });
  return decryptAiKey(env.AI_CREDENTIAL_ENCRYPTION_KEY, ownerId, binding, connection.encryptedKey);
}

export const aiConfiguration = (env: Env, selection?: AiSelection) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => resolveAiModel(env, store, actor.ownerId, selection));
  });

/** A connected account may select a model per action before saving a default. */
export const aiConnectionsAvailable = (env: Env) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    if (!env.AI_CREDENTIAL_ENCRYPTION_KEY) return false;
    return (yield* attempt(() => store.listAiConnections(actor.ownerId))).length > 0;
  });

export const aiTaskConfigured = (env: Env, binding?: AiConnectionBinding) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    if (!binding || !env.AI_CREDENTIAL_ENCRYPTION_KEY) return false;
    const connection = yield* attempt(() => store.getAiConnection(actor.ownerId, binding.id));
    return Boolean(
      connection &&
        connection.removedAt === null &&
        connection.encryptedKey &&
        connection.revision === binding.revision &&
        connection.provider === binding.provider,
    );
  });

export const readAiSettings = (env: Env) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const [connections, preferences] = yield* attempt(() =>
      Promise.all([
        store.listAiConnections(actor.ownerId),
        store.getWorkspacePreferences(actor.ownerId),
      ]),
    );
    return {
      ownerId: actor.ownerId,
      ...preferences,
      connections,
      available: Boolean(env.AI_CREDENTIAL_ENCRYPTION_KEY),
    };
  });

export const readOnboardingProgress = Effect.gen(function* () {
  const actor = yield* Actor,
    store = yield* Store;
  return yield* attempt(() => store.getOnboardingProgress(actor.ownerId));
});

export const saveAiConnection = (env: Env, input: SaveAiConnectionRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(async () => {
      const { apiKey, ...publicInput } = input;
      const binding = {
        id: input.id,
        provider: input.provider,
        revision: input.revision === null ? 0 : input.revision + 1,
      };
      const keyFingerprint = await fingerprint(apiKey);
      const replay = await store.replayCommand(
        actor.id,
        "save-ai-connection",
        input.idempotencyKey,
        { ...publicInput, keyFingerprint },
      );
      if (replay) return replay;
      const encryptedKey = await encryptAiKey(
        env.AI_CREDENTIAL_ENCRYPTION_KEY,
        actor.ownerId,
        binding,
        apiKey,
      );
      await listProviderModels(input.provider, apiKey);
      return store.saveAiConnection(actor, publicInput, {
        encryptedKey,
        keySuffix: apiKey.slice(-4),
        fingerprint: keyFingerprint,
      });
    });
  });

export const removeAiConnection = (input: RemoveAiConnectionRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.removeAiConnection(actor, input));
  });

export const readAiModels = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(async () => {
      const connection = await store.getAiConnection(actor.ownerId, id);
      if (!connection)
        throw new ApplicationError({ code: "NotFound", message: "AI connection not found." });
      const key = await loadAiCredential(env, store, actor.ownerId, connection);
      return listProviderModels(connection.provider, key);
    });
  });

export const saveWorkspacePreferences = (input: SaveWorkspacePreferencesRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.saveWorkspacePreferences(actor, input));
  });
