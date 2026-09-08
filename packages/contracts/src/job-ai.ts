import { EvidenceSelection, JobAiTask, RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";
import { CommandKey } from "./evidence";

export const StartJobAiRequest = Schema.Struct({
  ...AiSelectionFields,
  idempotencyKey: CommandKey,
  jobId: RecordId,
  revision: Revision,
  snapshotId: RecordId,
  task: JobAiTask,
  requirementId: Schema.NullOr(RecordId),
});
export type StartJobAiRequest = typeof StartJobAiRequest.Type;
export const JobAiIdentity = Schema.Struct({ id: RecordId });
export const JobAiList = Schema.Struct({
  jobId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export const ReviewJobAiRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
  decision: Schema.Literals(["Accepted", "Rejected"]),
  acknowledgeRemovedAssociations: Schema.Boolean,
  requirementIds: Schema.optionalKey(Schema.Array(RecordId).check(Schema.isMaxLength(100))),
  selections: Schema.optionalKey(Schema.Array(EvidenceSelection).check(Schema.isMaxLength(300))),
});
export type ReviewJobAiRequest = typeof ReviewJobAiRequest.Type;
export const RetryJobAiRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryJobAiRequest = typeof RetryJobAiRequest.Type;
