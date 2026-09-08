import { RecordId, Revision, WordingInput, WordingPath } from "@river/domain";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";
import { CommandKey } from "./evidence";
export const StartWordingRequest = Schema.Struct({
  ...AiSelectionFields,
  idempotencyKey: CommandKey,
  draftId: RecordId,
  revision: Revision,
  path: WordingPath,
  goal: WordingInput.fields.goal,
});
export type StartWordingRequest = typeof StartWordingRequest.Type;
export const WordingIdentity = Schema.Struct({ id: RecordId });
export const WordingList = Schema.Struct({
  draftId: RecordId,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export const ReviewWordingRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  idempotencyKey: CommandKey,
  decision: Schema.Literals(["Accepted", "Rejected"]),
  wording: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(10000))),
});
export type ReviewWordingRequest = typeof ReviewWordingRequest.Type;
export const RetryWordingRequest = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type RetryWordingRequest = typeof RetryWordingRequest.Type;

export const ReviewWordingBatchRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  draftId: RecordId,
  revision: Revision,
  items: Schema.Array(
    Schema.Struct({
      id: RecordId,
      revision: Revision,
      digest: ReviewWordingRequest.fields.digest,
      wording: Schema.NonEmptyString.check(Schema.isMaxLength(10000)),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(300)),
});
export type ReviewWordingBatchRequest = typeof ReviewWordingBatchRequest.Type;
