import { RecordId, Revision, ScoringFindingOutcome, ScoringPlatform } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const StartScoringRequest = Schema.Struct({
  checkpointId: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type StartScoringRequest = typeof StartScoringRequest.Type;
export const ScoringIdentityRequest = Schema.Struct({ id: RecordId });
export const RetryScoringRequest = Schema.Struct({
  ...ScoringIdentityRequest.fields,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryScoringRequest = typeof RetryScoringRequest.Type;
export const ScoringHistoryRequest = Schema.Struct({
  checkpointId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type ScoringHistoryRequest = typeof ScoringHistoryRequest.Type;
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const ReviewScoringFindingRequest = Schema.Struct({
  runId: RecordId,
  resultDigest: Digest,
  platform: ScoringPlatform,
  index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 49 })),
  findingDigest: Digest,
  revision: Revision,
  outcome: ScoringFindingOutcome,
  rationale: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
  idempotencyKey: CommandKey,
});
export type ReviewScoringFindingRequest = typeof ReviewScoringFindingRequest.Type;
export const CompareScoringRequest = Schema.Struct({ beforeId: RecordId, afterId: RecordId });
export type CompareScoringRequest = typeof CompareScoringRequest.Type;
