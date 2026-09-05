import { RecordId, Revision } from "@river/domain";
import {
  TemplateBase,
  TemplateBrief,
  TemplateLifecycle,
  TemplateOverrides,
  TemplateScope,
} from "@river/templates";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const TemplateDestination = Schema.Struct({
  id: Schema.NullOr(RecordId),
  revision: Schema.NullOr(Revision),
  name: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
});
export const SaveTemplateRequest = Schema.Struct({
  ...TemplateDestination.fields,
  idempotencyKey: CommandKey,
  base: TemplateBase,
  scope: TemplateScope,
  source: Schema.NonEmptyString.check(Schema.isMaxLength(32768)),
  overrides: TemplateOverrides,
});
export type SaveTemplateRequest = typeof SaveTemplateRequest.Type;
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
  state: Schema.NullOr(TemplateLifecycle),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type TemplateSearch = typeof TemplateSearch.Type;
export const StartTemplateValidationRequest = Schema.Struct({
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
  ...TemplateDestination.fields,
  reservedDesignId: RecordId,
  expectedInputDigest: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  idempotencyKey: CommandKey,
  base: TemplateBase,
  scope: TemplateScope,
  brief: TemplateBrief,
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
