import { RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";

export const TrashKind = Schema.Literals([
  "source",
  "evidence",
  "job",
  "content",
  "block",
  "section",
  "template",
]);
export type TrashKind = typeof TrashKind.Type;
export const TrashSearch = Schema.Struct({
  kind: Schema.NullOr(TrashKind),
  query: Schema.String.check(Schema.isMaxLength(200)),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type TrashSearch = typeof TrashSearch.Type;
export const TrashItem = Schema.Struct({
  id: RecordId,
  kind: TrashKind,
  label: Schema.String,
  revision: Revision,
  revisionId: Schema.NullOr(RecordId),
  deletedAt: Schema.Number,
});
export type TrashItem = typeof TrashItem.Type;
export const SetTrashRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  kind: TrashKind,
  revision: Revision,
  archived: Schema.Boolean,
});
export type SetTrashRequest = typeof SetTrashRequest.Type;
