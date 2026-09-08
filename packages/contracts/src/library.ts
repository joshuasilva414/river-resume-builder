import {
  BlockFieldKey,
  ContentType,
  LibraryData,
  LibraryKind,
  RecordId,
  Revision,
} from "@river/domain";
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
  archived: Schema.optional(Schema.Boolean),
});
export type LibrarySearch = typeof LibrarySearch.Type;
export const InspectLibraryRequest = Schema.Struct({
  id: RecordId,
  revisionId: Schema.optional(RecordId),
});
export type InspectLibraryRequest = typeof InspectLibraryRequest.Type;
export const SetLibraryArchivedRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  archived: Schema.Boolean,
  rationale: Schema.String.check(Schema.isMaxLength(4000)),
});
export type SetLibraryArchivedRequest = typeof SetLibraryArchivedRequest.Type;

/** Starter fields contain only wording entered by the Owner. */
export const CreateLibraryStarterRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  type: ContentType,
  label: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  fields: Schema.Array(
    Schema.Struct({
      key: BlockFieldKey,
      values: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(10000))).check(
        Schema.isMaxLength(50),
      ),
    }),
  ).check(Schema.isMaxLength(8)),
});
export type CreateLibraryStarterRequest = typeof CreateLibraryStarterRequest.Type;
