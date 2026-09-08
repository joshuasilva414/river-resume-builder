import { Composition, LibraryReference, RecordId, Revision } from "@river/domain";
import { Schema } from "effect";
import { CommandKey } from "./evidence";
export const CreateResumeRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  jobId: RecordId,
  jobRevision: Revision,
  snapshotId: RecordId,
  data: Composition,
});
export type CreateResumeRequest = typeof CreateResumeRequest.Type;
export const SaveResumeRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  data: Composition,
});
export type SaveResumeRequest = typeof SaveResumeRequest.Type;
export const BranchResumeRequest = Schema.Struct({ ...SaveResumeRequest.fields });
export type BranchResumeRequest = typeof BranchResumeRequest.Type;
export const InspectResumeRequest = Schema.Struct({ id: RecordId });
export const ResumeSearch = Schema.Struct({
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  jobId: Schema.NullOr(RecordId),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type ResumeSearch = typeof ResumeSearch.Type;
export const PreviewResumeRequest = Schema.Struct({
  data: Schema.optional(Composition),
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
});
export type PreviewResumeRequest = typeof PreviewResumeRequest.Type;
export const CopyPlacementRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  sourceId: RecordId,
  sourceRevision: Revision,
  destinationId: RecordId,
  destinationRevision: Revision,
  sectionId: RecordId,
  blockId: Schema.NullOr(RecordId),
  destinationSectionId: Schema.NullOr(RecordId),
  position: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 30 })),
});
export type CopyPlacementRequest = typeof CopyPlacementRequest.Type;

export const ApplyLibraryRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  id: RecordId,
  revision: Revision,
  sectionId: RecordId,
  blockId: Schema.NullOr(RecordId),
  contentId: Schema.NullOr(RecordId),
  reference: LibraryReference,
  libraryRevision: Revision,
  replaceLocal: Schema.Boolean,
});
export type ApplyLibraryRequest = typeof ApplyLibraryRequest.Type;
