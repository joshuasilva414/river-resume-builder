import { ContentType, LibraryData, LibraryKind, RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";
export const SaveLibraryRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: Schema.NullOr(RecordId),
  revision: Schema.NullOr(Revision),
  label: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  data: LibraryData,
  rationale: Schema.String.check(Schema.isMaxLength(4000)),
});
export type SaveLibraryRequest = typeof SaveLibraryRequest.Type;
export const LibrarySearch = Schema.Struct({
  kind: LibraryKind,
  type: Schema.NullOr(ContentType),
  query: Schema.String.check(Schema.isMaxLength(200)),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type LibrarySearch = typeof LibrarySearch.Type;
export const InspectLibraryRequest = Schema.Struct({
  id: RecordId,
  revisionId: Schema.optional(RecordId),
});
export type InspectLibraryRequest = typeof InspectLibraryRequest.Type;
