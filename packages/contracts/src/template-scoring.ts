import { RecordId, Revision } from "@river/domain";
import { TemplateBase } from "@river/templates";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const StartTemplateScoringRequest = Schema.Struct({
  base: TemplateBase,
  reviewRevision: Schema.NullOr(Revision),
  idempotencyKey: CommandKey,
});
export type StartTemplateScoringRequest = typeof StartTemplateScoringRequest.Type;
export const RetryTemplateScoringRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryTemplateScoringRequest = typeof RetryTemplateScoringRequest.Type;
export const TemplateScoringHistoryRequest = Schema.Struct({
  base: TemplateBase,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type TemplateScoringHistoryRequest = typeof TemplateScoringHistoryRequest.Type;
