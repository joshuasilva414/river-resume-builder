import { Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

const AccountId = Schema.NonEmptyString.check(Schema.isMaxLength(200));
const DailyLimit = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10000 }));
export const AdminDashboardRequest = Schema.Struct({
  query: Schema.String.check(Schema.isMaxLength(200)),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type AdminDashboardRequest = typeof AdminDashboardRequest.Type;
export const SetScoringLimitRequest = Schema.Struct({
  ownerId: Schema.NullOr(AccountId),
  dailyLimit: Schema.NullOr(DailyLimit),
  revision: Revision,
  idempotencyKey: CommandKey,
});
export type SetScoringLimitRequest = typeof SetScoringLimitRequest.Type;
export const ResetScoringAllowanceRequest = Schema.Struct({
  ownerId: AccountId,
  day: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  used: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  idempotencyKey: CommandKey,
});
export type ResetScoringAllowanceRequest = typeof ResetScoringAllowanceRequest.Type;
