import { RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";
import { CheckpointTemplateReplacement } from "./checkpoints";
import { CommandKey } from "./evidence";

export const StartSourceRefinementRequest = Schema.Struct({
  ...AiSelectionFields,
  idempotencyKey: CommandKey,
  checkpointId: RecordId,
  operationId: RecordId,
  goal: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export type StartSourceRefinementRequest = typeof StartSourceRefinementRequest.Type;
export const SourceRefinementIdentity = Schema.Struct({ id: RecordId });
export const SourceRefinementList = Schema.Struct({
  checkpointId: RecordId,
  state: Schema.optional(Schema.Literals(["Pending", "Accepted", "Rejected"])),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type SourceRefinementList = typeof SourceRefinementList.Type;
export const RetrySourceRefinementRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
});
export type RetrySourceRefinementRequest = typeof RetrySourceRefinementRequest.Type;
export const ReviewSourceRefinementRequest = Schema.Struct({
  ...RetrySourceRefinementRequest.fields,
  proposalId: RecordId,
  candidateDigest: Schema.NonEmptyString,
  previewOperationId: Schema.NullOr(RecordId),
  reviewDigest: Schema.NullOr(Schema.NonEmptyString),
  decision: Schema.Literals(["Accepted", "Rejected"]),
  coverageConfirmed: Schema.Boolean,
  reviewPolicy: Schema.optionalKey(Schema.Literal("river-document-review-v2")),
});
export type ReviewSourceRefinementRequest = typeof ReviewSourceRefinementRequest.Type;

export const ReturnToStructuredRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  checkpointId: RecordId,
  structuredBaseId: RecordId,
  candidateDigest: Schema.NonEmptyString,
  name: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  regenerationConfirmed: Schema.Boolean,
  replacement: Schema.optional(CheckpointTemplateReplacement),
});
export type ReturnToStructuredRequest = typeof ReturnToStructuredRequest.Type;
