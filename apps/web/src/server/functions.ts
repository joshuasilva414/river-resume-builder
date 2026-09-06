import {
  CancelOperationRequest,
  CreateCredentialRequest,
  CreateSourceRequest,
  InspectSourceRequest,
  ReadBackupStatusRequest,
  ResumeSourceRequest,
  RetryBackupRequest,
  RetrySourceRequest,
  RevokeCredentialRequest,
  StartProofRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { createCredential, getAccessSettings, revokeCredential } from "./access";
import { isAdministrator } from "./account-access";
import { authenticate } from "./auth";
import { readBackupStatus, retryBackup } from "./backups";
import { bindings } from "./env";
import { cancelOperation, dispatchPending, execute, listOperations, startProof } from "./services";
import {
  createSource,
  inspectSource,
  listSources,
  resumeSourceUpload,
  retrySource,
} from "./sources";

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
export const getOperations = createServerFn({ method: "GET" }).handler(async () => {
  const env = bindings();
  return execute(env, getRequestHeaders(), listOperations(env.ENVIRONMENT));
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
export const compileProof = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartProofRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), startProof(env.ENVIRONMENT, data));
    if (result.ok) {
      // The committed dispatch remains retryable even if Workflow creation is interrupted.
      try {
        await dispatchPending(env);
      } catch {
        /* The scheduled reconciler retries pending dispatches. */
      }
    }
    return result;
  });

export const cancelDocumentOperation = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CancelOperationRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), cancelOperation(data));
    if (result.ok) {
      try {
        await dispatchPending(env);
      } catch {
        /* Durable cancellation is retried by the reconciler. */
      }
    }
    return result;
  });

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
export const addSource = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CreateSourceRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), createSource(env, data), "source:write");
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const reprocessSource = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetrySourceRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), retrySource(data), "source:write");
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });

export const resumeUpload = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ResumeSourceRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(
      env,
      getRequestHeaders(),
      resumeSourceUpload(env, data),
      "source:write",
    );
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
