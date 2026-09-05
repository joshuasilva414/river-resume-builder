import { RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey, SourceCandidateOrigin } from "./evidence";
export const StartDuplicateAiRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  pairId: RecordId,
  revision: Revision,
  firstRevision: Revision,
  secondRevision: Revision,
});
export type StartDuplicateAiRequest = typeof StartDuplicateAiRequest.Type;
export const DuplicateAiIdentity = Schema.Struct({ id: RecordId });
export const DuplicateAiList = Schema.Struct({
  claimId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export const ReviewDuplicateAiRequest = Schema.Struct({
  ...SourceCandidateOrigin.fields,
  revision: Revision,
  decision: Schema.Literals(["Accepted", "Rejected"]),
  idempotencyKey: CommandKey,
});
export type ReviewDuplicateAiRequest = typeof ReviewDuplicateAiRequest.Type;
export const RetryDuplicateAiRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryDuplicateAiRequest = typeof RetryDuplicateAiRequest.Type;
