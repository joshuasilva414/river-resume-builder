import { RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const feedbackKinds = ["Bug report", "Feature request"] as const;
export const feedbackStatuses = ["New", "In review", "Planned", "Resolved", "Closed"] as const;
export const FeedbackKind = Schema.Literals(feedbackKinds);
export type FeedbackKind = typeof FeedbackKind.Type;
export const FeedbackStatus = Schema.Literals(feedbackStatuses);
export type FeedbackStatus = typeof FeedbackStatus.Type;

export const SubmitFeedbackRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  kind: FeedbackKind,
  title: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  description: Schema.NonEmptyString.check(Schema.isMaxLength(12000)),
});
export type SubmitFeedbackRequest = typeof SubmitFeedbackRequest.Type;
export const FeedbackSearch = Schema.Struct({
  inbox: Schema.Boolean,
  kind: Schema.NullOr(FeedbackKind),
  status: Schema.NullOr(FeedbackStatus),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type FeedbackSearch = typeof FeedbackSearch.Type;
export const UpdateFeedbackRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  status: FeedbackStatus,
  response: Schema.String.check(Schema.isMaxLength(4000)),
});
export type UpdateFeedbackRequest = typeof UpdateFeedbackRequest.Type;
