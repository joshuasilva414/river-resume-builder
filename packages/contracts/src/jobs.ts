import {
  EvidenceSelection,
  JobDetails,
  PostingInput,
  RecordId,
  RequirementFields,
} from "@river/domain";
import { Schema } from "effect";
import { CommandKey, ObservedRecord } from "./evidence";

const JobBase = ObservedRecord.fields;
const WorkspaceBase = { ...JobBase, snapshotId: RecordId };
export const JobCommand = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("create"),
    idempotencyKey: CommandKey,
    details: JobDetails,
    posting: PostingInput,
  }),
  Schema.Struct({ type: Schema.Literal("details"), ...JobBase, details: JobDetails }),
  Schema.Struct({ type: Schema.Literal("snapshot"), ...JobBase, posting: PostingInput }),
  Schema.Struct({
    type: Schema.Literal("archive"),
    ...JobBase,
    archived: Schema.Boolean,
    rationale: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
  }),
  Schema.Struct({
    type: Schema.Literal("requirement"),
    ...WorkspaceBase,
    requirementId: Schema.NullOr(RecordId),
    fields: RequirementFields,
  }),
  Schema.Struct({
    type: Schema.Literal("remove-requirement"),
    ...WorkspaceBase,
    requirementId: RecordId,
  }),
  Schema.Struct({
    type: Schema.Literal("selection"),
    ...WorkspaceBase,
    selection: EvidenceSelection,
    selected: Schema.Boolean,
  }),
]);
export type JobCommand = typeof JobCommand.Type;
export const JobSearch = Schema.Struct({
  query: Schema.String.check(Schema.isMaxLength(200)),
  archived: Schema.Boolean,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000000 })),
});
export type JobSearch = typeof JobSearch.Type;
export const InspectJobRequest = Schema.Struct({
  id: RecordId,
  snapshotId: Schema.optional(RecordId),
  workspaceRevisionId: Schema.optional(RecordId),
});
export type InspectJobRequest = typeof InspectJobRequest.Type;
