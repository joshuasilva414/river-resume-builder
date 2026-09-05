import {
  AcknowledgeCheckpointRequest,
  CaptureCheckpointRequest,
  CheckpointHistoryRequest,
  CheckpointIdentity,
  ExportCheckpointRequest,
  RestoreCheckpointRequest,
  ReviewCheckpointRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import {
  acknowledgeCheckpoint,
  captureCheckpoint,
  exportCheckpoint,
  inspectCheckpoint,
  inspectCheckpointBranch,
  listCheckpoints,
  restoreCheckpoint,
  retryCheckpoint,
  reviewCheckpoint,
} from "./checkpoints";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
export const captureResumeCheckpoint = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CaptureCheckpointRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), captureCheckpoint(data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const getCheckpoint = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CheckpointIdentity))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectCheckpoint(data.id)));
export const getCheckpoints = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CheckpointHistoryRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), listCheckpoints(data)));
export const getCheckpointBranchSource = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CheckpointIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectCheckpointBranch(data.id)),
  );
export const createCheckpointBranch = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RestoreCheckpointRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), restoreCheckpoint(data)));
export const refreshCheckpointReview = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewCheckpointRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewCheckpoint(data)));
export const saveCheckpointAcknowledgments = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(AcknowledgeCheckpointRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), acknowledgeCheckpoint(data)));
export const authorizeCheckpointExport = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ExportCheckpointRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), exportCheckpoint(data)));
export const retryCheckpointRender = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewCheckpointRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryCheckpoint(data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
