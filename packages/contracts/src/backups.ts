import { Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

const BackupDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));

export const ReadBackupStatusRequest = Schema.Struct({
  before: Schema.optional(Schema.NullOr(BackupDate)),
  date: Schema.optional(Schema.NullOr(BackupDate)),
});
export type ReadBackupStatusRequest = typeof ReadBackupStatusRequest.Type;

export const RetryBackupRequest = Schema.Struct({
  date: BackupDate,
  attempt: Revision,
  idempotencyKey: CommandKey,
});
export type RetryBackupRequest = typeof RetryBackupRequest.Type;
