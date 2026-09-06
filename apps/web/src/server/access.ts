import type { CreateCredentialRequest, RevokeCredentialRequest } from "@river/contracts";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";

export const getAccessSettings = Effect.gen(function* () {
  const actor = yield* Actor;
  const repository = yield* Store;
  return yield* attempt(async () => ({
    usage: await repository.readUsage(actor.ownerId),
    credentials: (await repository.listCredentials(actor.ownerId)).map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
      expiresAt: item.expiresAt === null ? null : new Date(item.expiresAt).toISOString(),
      revokedAt: item.revokedAt === null ? null : new Date(item.revokedAt).toISOString(),
      lastUsedAt: item.lastUsedAt === null ? null : new Date(item.lastUsedAt).toISOString(),
    })),
    activity: (await repository.activity(actor.ownerId)).map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
      before: JSON.stringify(item.before, null, 2),
      after: JSON.stringify(item.after, null, 2),
    })),
  }));
});
export const createCredential = (input: CreateCredentialRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const repository = yield* Store;
    return yield* attempt(() => repository.createCredential(actor.id, input));
  });
export const revokeCredential = (input: RevokeCredentialRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const repository = yield* Store;
    return yield* attempt(() => repository.revokeCredential(actor.id, input));
  });
