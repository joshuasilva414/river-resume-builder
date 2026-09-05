import { Schema } from "effect";
import { RecordId } from "./evidence";

export const JobDetails = Schema.Struct({
  role: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  company: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  location: Schema.String.check(Schema.isMaxLength(200)),
});
export type JobDetails = typeof JobDetails.Type;
export const PostingInput = Schema.Struct({
  text: Schema.NonEmptyString.check(Schema.isMaxLength(200000)),
  url: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2048))),
});
export const PostingPassage = Schema.Struct({
  snapshotId: RecordId,
  quote: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  end: Schema.Int.check(Schema.isGreaterThan(0)),
});
export const RequirementFields = Schema.Struct({
  text: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
  category: Schema.NonEmptyString.check(Schema.isMaxLength(60)),
  priority: Schema.Literals(["Required", "Preferred", "Unspecified"]),
  keywords: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(100))).check(
    Schema.isMaxLength(30),
  ),
  confidence: Schema.NullOr(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  passages: Schema.Array(PostingPassage).check(Schema.isMaxLength(5)),
});
export type RequirementFields = typeof RequirementFields.Type;
export const JobRequirement = Schema.Struct({ id: RecordId, ...RequirementFields.fields });
export type JobRequirement = typeof JobRequirement.Type;
export const EvidenceSelection = Schema.Struct({
  claimId: RecordId,
  evidenceRevisionId: RecordId,
  requirementId: Schema.NullOr(RecordId),
});
export type EvidenceSelection = typeof EvidenceSelection.Type;
export const JobWorkspace = Schema.Struct({
  requirements: Schema.Array(JobRequirement).check(Schema.isMaxLength(100)),
  selections: Schema.Array(EvidenceSelection).check(Schema.isMaxLength(300)),
});
export type JobWorkspace = typeof JobWorkspace.Type;
export const selectionIdentity = (
  selection: Pick<EvidenceSelection, "claimId" | "requirementId">,
) => `${selection.claimId}:${selection.requirementId ?? "general"}`;
