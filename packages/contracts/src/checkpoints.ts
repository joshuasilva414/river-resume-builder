import { RecordId, Revision, Theme } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";
export const CaptureCheckpointRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  label: Schema.optional(Schema.String.check(Schema.isMaxLength(80))),
});
export type CaptureCheckpointRequest = typeof CaptureCheckpointRequest.Type;
export const CheckpointIdentity = Schema.Struct({ id: RecordId });
export const CheckpointHistoryRequest = Schema.Struct({
  draftId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type CheckpointHistoryRequest = typeof CheckpointHistoryRequest.Type;
export const ReviewCheckpointRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
});
export type ReviewCheckpointRequest = typeof ReviewCheckpointRequest.Type;
export const AcknowledgeCheckpointRequest = Schema.Struct({
  ...ReviewCheckpointRequest.fields,
  reportId: RecordId,
  digest: Schema.NonEmptyString,
  issueIds: Schema.Array(Schema.NonEmptyString).check(Schema.isMaxLength(5000)),
});
export type AcknowledgeCheckpointRequest = typeof AcknowledgeCheckpointRequest.Type;
export const ExportCheckpointRequest = Schema.Struct({
  ...ReviewCheckpointRequest.fields,
  reportId: RecordId,
  digest: Schema.NonEmptyString,
});
export type ExportCheckpointRequest = typeof ExportCheckpointRequest.Type;
export const RestoreCheckpointRequest = Schema.Struct({
  checkpointId: RecordId,
  name: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  replacement: Schema.optional(
    Schema.Struct({
      theme: Theme,
      template: Schema.NullOr(Schema.Struct({ designId: RecordId, revisionId: RecordId })),
      confirmed: Schema.Boolean,
    }),
  ),
  idempotencyKey: CommandKey,
});
export type RestoreCheckpointRequest = typeof RestoreCheckpointRequest.Type;
