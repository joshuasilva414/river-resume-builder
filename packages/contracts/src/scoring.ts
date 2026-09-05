import { RecordId, Revision } from "@river/domain";
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
