import type {
  AcknowledgeCheckpointRequest,
  CaptureCheckpointRequest,
  CheckpointHistoryRequest,
  ExportCheckpointRequest,
  RestoreCheckpointRequest,
  ReviewCheckpointRequest,
} from "@river/contracts";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";
export const captureCheckpoint = (input: CaptureCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.captureCheckpoint(actor, input));
  });
export const inspectCheckpoint = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectCheckpoint(actor.ownerId, id));
  });
export const listCheckpoints = (input: CheckpointHistoryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listCheckpoints(actor.ownerId, input));
  });
export const reviewCheckpoint = (input: ReviewCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.reviewCheckpoint(actor, input));
  });
export const acknowledgeCheckpoint = (input: AcknowledgeCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.acknowledgeCheckpoint(actor, input));
  });
export const exportCheckpoint = (input: ExportCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.exportCheckpoint(actor, input));
  });
export const retryCheckpoint = (input: ReviewCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.retryCheckpoint(actor, input));
  });
export const inspectCheckpointBranch = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectCheckpointBranch(actor, id));
  });
export const restoreCheckpoint = (input: RestoreCheckpointRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.restoreCheckpoint(actor, input));
  });
