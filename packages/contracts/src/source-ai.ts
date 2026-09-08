import {
  ContextReference,
  EvidenceMaterialInput,
  EvidenceMetadata,
  RecordId,
  Revision,
  SourceAiInput,
} from "@river/domain";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";
import { CommandKey } from "./evidence";
export const StartSourceAiRequest = Schema.Struct({
  ...AiSelectionFields,
  idempotencyKey: CommandKey,
  sourceId: RecordId,
  revision: Revision,
  processingId: RecordId,
  focus: SourceAiInput.fields.focus,
  contexts: Schema.Array(ContextReference).check(Schema.isMaxLength(10)),
});
export type StartSourceAiRequest = typeof StartSourceAiRequest.Type;
export const SourceAiIdentity = Schema.Struct({ id: RecordId });
export const SourceAiList = Schema.Struct({
  sourceId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export const ReviewSourceCandidateRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  decision: Schema.Literals(["Accepted", "Rejected"]),
  idempotencyKey: CommandKey,
});
export type ReviewSourceCandidateRequest = typeof ReviewSourceCandidateRequest.Type;
/** The displayed complete set is supplied for Add all; every item is checked before any write. */
export const BulkAddSourceEvidenceRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  taskId: RecordId,
  mode: Schema.Literals(["selected", "all"]),
  items: Schema.Array(
    Schema.Struct({
      id: RecordId,
      revision: Revision,
      digest: ReviewSourceCandidateRequest.fields.digest,
      assertion: EvidenceMaterialInput.fields.assertion,
      metadata: EvidenceMetadata,
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
});
export type BulkAddSourceEvidenceRequest = typeof BulkAddSourceEvidenceRequest.Type;
export const RetrySourceAiRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetrySourceAiRequest = typeof RetrySourceAiRequest.Type;
export const ClarificationList = Schema.Struct({ claimId: RecordId });
export const AnswerClarificationRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  claimRevision: Revision,
  answerSourceId: RecordId,
  answerEvidenceRevisionId: RecordId,
  idempotencyKey: CommandKey,
});
export type AnswerClarificationRequest = typeof AnswerClarificationRequest.Type;
