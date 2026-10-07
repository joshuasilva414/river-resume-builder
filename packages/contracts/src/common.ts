import { Revision } from "@river/domain";
import { Schema } from "effect";
export const CommandKey = Schema.NonEmptyString.check(Schema.isMaxLength(128));
export const ArchiveSourceRequest = Schema.Struct({
  id: Schema.NonEmptyString,
  revision: Revision,
  idempotencyKey: CommandKey,
  archived: Schema.Boolean,
});
export type ArchiveSourceRequest = typeof ArchiveSourceRequest.Type;
export const CancelBackupRequest = Schema.Struct({
  operationId: Schema.NonEmptyString,
  idempotencyKey: CommandKey,
});
