import { AiProvider, AiSelection, RecordId, Revision, WorkspacePreferences } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const AiSelectionFields = { ai: Schema.optional(AiSelection) };
export const SaveAiConnectionRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Schema.NullOr(Revision),
  provider: AiProvider,
  apiKey: Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
});
export type SaveAiConnectionRequest = typeof SaveAiConnectionRequest.Type;
export const RemoveAiConnectionRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
});
export type RemoveAiConnectionRequest = typeof RemoveAiConnectionRequest.Type;
export const AiConnectionRequest = Schema.Struct({ id: RecordId });
export const SaveWorkspacePreferencesRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  revision: Revision,
  preferences: WorkspacePreferences,
});
export type SaveWorkspacePreferencesRequest = typeof SaveWorkspacePreferencesRequest.Type;
