import {
  CancelBackupRequest,
  CreateCredentialRequest,
  InspectSourceRequest,
  ReadBackupStatusRequest,
  RetryBackupRequest,
  RevokeCredentialRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { createCredential, getAccessSettings, revokeCredential } from "./access";
import { isAdministrator } from "./account-access";
import { authenticate } from "./auth";
import { readBackupStatus, retryBackup } from "./backups";
import { bindings } from "./env";
import { Actor, attempt, dispatchPending, execute, Store } from "./services";
import { inspectSource, listSources } from "./sources";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const env = bindings();
  const session = await authenticate(env, getRequestHeaders());
  return {
    user: session
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          isAdmin: isAdministrator(env, session.user.email),
        }
      : null,
    githubEnabled: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    environment: env.ENVIRONMENT,
  };
});
export const getSettings = createServerFn({ method: "GET" }).handler(async () =>
  execute(bindings(), getRequestHeaders(), getAccessSettings),
);
export const getBackupStatus = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ReadBackupStatusRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    return execute(env, getRequestHeaders(), readBackupStatus(env, data));
  });
export const retryDailyBackup = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryBackupRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), retryBackup(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const createAgentCredential = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CreateCredentialRequest))
  .handler(async ({ data }) => execute(bindings(), getRequestHeaders(), createCredential(data)));
export const revokeAgentCredential = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RevokeCredentialRequest))
  .handler(async ({ data }) => execute(bindings(), getRequestHeaders(), revokeCredential(data)));
export const getSources = createServerFn({ method: "GET" }).handler(async () =>
  execute(bindings(), getRequestHeaders(), listSources, "source:read"),
);
export const getSource = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(InspectSourceRequest))
  .handler(async ({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      inspectSource(bindings(), data.id, data.processingId),
      "source:read",
    ),
  );

export const cancelBackupOperation = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CancelBackupRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(
      env,
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() =>
          store.cancelBackupOperation(actor.ownerId, data.operationId, data.idempotencyKey),
        );
      }),
    );
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
