import { RecordId, Revision } from "@river/domain";
import {
  TemplateBase,
  TemplateBrief,
  TemplateGraph,
  TemplateLifecycle,
  TemplateOverrides,
  TemplateScope,
} from "@river/templates";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";
import { CommandKey } from "./evidence";

export const TemplateDestination = Schema.Struct({
  id: Schema.NullOr(RecordId),
  revision: Schema.NullOr(Revision),
  name: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
});
export const SaveTemplateRequest = Schema.Struct({
  workingGraph: Schema.optional(TemplateGraph),
  ...TemplateDestination.fields,
  idempotencyKey: CommandKey,
  base: TemplateBase,
  scope: TemplateScope,
  source: Schema.NonEmptyString.check(Schema.isMaxLength(32768)),
  overrides: TemplateOverrides,
});
export type SaveTemplateRequest = typeof SaveTemplateRequest.Type;
export const PreviewWorkingTemplateRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  graph: TemplateGraph,
});
export type PreviewWorkingTemplateRequest = typeof PreviewWorkingTemplateRequest.Type;
export const MixTemplateRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  name: TemplateDestination.fields.name,
  base: TemplateBase,
  picks: Schema.Array(Schema.Struct({ scope: TemplateScope, donor: TemplateBase })).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(14),
  ),
});
export type MixTemplateRequest = typeof MixTemplateRequest.Type;
export const TemplateIdentity = Schema.Struct({ revisionId: RecordId });
export const TemplateSearch = Schema.Struct({
  archived: Schema.optional(Schema.Boolean),
  state: Schema.NullOr(TemplateLifecycle),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type TemplateSearch = typeof TemplateSearch.Type;
export const StartTemplateValidationRequest = Schema.Struct({
  approveOnSuccess: Schema.optional(Schema.Boolean),
  idempotencyKey: CommandKey,
  revisionId: RecordId,
  revision: Revision,
});
export type StartTemplateValidationRequest = typeof StartTemplateValidationRequest.Type;
export const ApproveTemplateRequest = Schema.Struct({
  ...StartTemplateValidationRequest.fields,
  validationId: RecordId,
  reportDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  visualReview: Schema.Literal(true),
});
export type ApproveTemplateRequest = typeof ApproveTemplateRequest.Type;
export const RetireTemplateRequest = Schema.Struct({
  ...StartTemplateValidationRequest.fields,
  rationale: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export type RetireTemplateRequest = typeof RetireTemplateRequest.Type;
export const StartTemplateAiRequest = Schema.Struct({
  workingGraph: Schema.optional(TemplateGraph),
  ...AiSelectionFields,
  ...TemplateDestination.fields,
  reservedDesignId: RecordId,
  expectedInputDigest: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  idempotencyKey: CommandKey,
  base: TemplateBase,
  scope: TemplateScope,
  brief: TemplateBrief,
  sourcePromotion: Schema.optional(
    Schema.Struct({
      checkpointId: RecordId,
      candidateDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    }),
  ),
  conversation: Schema.optional(
    Schema.Struct({
      id: RecordId,
      revision: Revision,
      instruction: Schema.NonEmptyString.check(Schema.isMaxLength(8000)),
      priorTaskIds: Schema.Array(RecordId).check(Schema.isMaxLength(100)),
    }),
  ),
});
export type StartTemplateAiRequest = typeof StartTemplateAiRequest.Type;
export const ReviewTemplateAiRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  decision: Schema.Literals(["Accepted", "Rejected"]),
  previewOperationId: Schema.NullOr(RecordId),
  previewDigest: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
});
export type ReviewTemplateAiRequest = typeof ReviewTemplateAiRequest.Type;
export const TemplateAiIdentity = Schema.Struct({ id: RecordId });
export const TemplateAiList = Schema.Struct({
  designId: Schema.NullOr(RecordId),
  state: Schema.NullOr(Schema.Literals(["Pending", "Accepted", "Rejected"])),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type TemplateAiList = typeof TemplateAiList.Type;
export const RetryTemplateAiRequest = Schema.Struct({
  ...TemplateAiIdentity.fields,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryTemplateAiRequest = typeof RetryTemplateAiRequest.Type;
export const TemplateConversationRequest = Schema.Struct({
  id: RecordId,
  before: Schema.NullOr(Revision),
  scope: TemplateScope,
});
export type TemplateConversationRequest = typeof TemplateConversationRequest.Type;
