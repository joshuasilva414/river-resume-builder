import {
  ContextData,
  EvidenceMaterialInput,
  EvidenceMetadata,
  EvidenceType,
  RecordId,
  ReviewState,
  Revision,
} from "@river/domain";
import { Schema } from "effect";
export const CommandKey = Schema.NonEmptyString.check(Schema.isMaxLength(128));
export const EvidenceIdentity = Schema.Struct({ id: RecordId });
export const ObservedRecord = Schema.Struct({
  id: RecordId,
  revision: Revision,
  idempotencyKey: CommandKey,
});
export const SaveContextRequest = Schema.Struct({
  id: Schema.NullOr(RecordId),
  revision: Schema.NullOr(Revision),
  idempotencyKey: CommandKey,
  data: ContextData,
});
export type SaveContextRequest = typeof SaveContextRequest.Type;
export const SourceCandidateOrigin = Schema.Struct({
  id: RecordId,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export type SourceCandidateOrigin = typeof SourceCandidateOrigin.Type;
export const ReviewedComparisonOrigin = Schema.Struct(SourceCandidateOrigin.fields);
export type ReviewedComparisonOrigin = typeof ReviewedComparisonOrigin.Type;
export const CreateEvidenceRequest = Schema.Struct({
  idempotencyKey: CommandKey,
  material: EvidenceMaterialInput,
  metadata: EvidenceMetadata,
  originCandidate: Schema.optional(SourceCandidateOrigin),
});
export const EditEvidenceRequest = Schema.Struct({
  ...ObservedRecord.fields,
  metadata: Schema.optional(EvidenceMetadata),
  material: EvidenceMaterialInput,
});
export const EvidenceMetadataRequest = Schema.Struct({
  ...ObservedRecord.fields,
  metadata: EvidenceMetadata,
});
export const ReviewEvidenceRequest = Schema.Struct({
  ...ObservedRecord.fields,
  revisionId: RecordId,
  state: ReviewState,
  rationale: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export const ArchiveEvidenceRequest = Schema.Struct({
  ...ObservedRecord.fields,
  archived: Schema.Boolean,
  rationale: Schema.optional(Schema.String.check(Schema.isMaxLength(4000))),
});
export const MergeEvidenceRequest = Schema.Struct({
  ...ObservedRecord.fields,
  sourceId: RecordId,
  sourceRevision: Revision,
  material: EvidenceMaterialInput,
  rationale: Schema.optional(Schema.String.check(Schema.isMaxLength(4000))),
  comparisonOrigin: Schema.optional(ReviewedComparisonOrigin),
});
export const DismissDuplicateRequest = Schema.Struct({
  ...ObservedRecord.fields,
  rationale: Schema.optional(Schema.String.check(Schema.isMaxLength(4000))),
  comparisonOrigin: Schema.optional(ReviewedComparisonOrigin),
});
export const EvidenceSearch = Schema.Struct({
  type: Schema.optional(EvidenceType),
  query: Schema.String.check(Schema.isMaxLength(200)),
  status: Schema.Literals(["All", "Draft", "Needs clarification", "Verified"]),
  archived: Schema.NullOr(Schema.Boolean),
  contextId: Schema.NullOr(RecordId),
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type EvidenceSearch = typeof EvidenceSearch.Type;

export const AdvertisedEvidenceCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("create"), ...CreateEvidenceRequest.fields }),
  Schema.Struct({ type: Schema.Literal("edit"), ...EditEvidenceRequest.fields }),
  Schema.Struct({ type: Schema.Literal("metadata"), ...EvidenceMetadataRequest.fields }),
  Schema.Struct({ type: Schema.Literal("archive"), ...ArchiveEvidenceRequest.fields }),
  Schema.Struct({ type: Schema.Literal("merge"), ...MergeEvidenceRequest.fields }),
  Schema.Struct({ type: Schema.Literal("keep-separate"), ...DismissDuplicateRequest.fields }),
  Schema.Struct({ type: Schema.Literal("context"), ...SaveContextRequest.fields }),
]);
// Decode the retired call so REST/MCP clients receive a useful migration error.
export const EvidenceCommand = Schema.Union([
  AdvertisedEvidenceCommand,
  Schema.Struct({ type: Schema.Literal("review"), ...ReviewEvidenceRequest.fields }),
]);
export type EvidenceCommand = typeof EvidenceCommand.Type;
export const ArchiveSourceRequest = Schema.Struct({
  ...ObservedRecord.fields,
  archived: Schema.Boolean,
});
export type ArchiveSourceRequest = typeof ArchiveSourceRequest.Type;
