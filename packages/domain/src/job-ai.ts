import { Schema } from "effect";
import { AiExecutionFields, AiModel } from "./ai";
import { ApplicationError, newId, Revision } from "./core";
import { ContextData, EvidenceMaterial, RecordId, ReviewState } from "./evidence";
import {
  isQualification,
  JobDetails,
  JobRequirement,
  JobWorkspace,
  PostingPassage,
  RequirementFields,
} from "./jobs";
import { indexTextPassages } from "./text-passages";

export const JobAiTask = Schema.Literals(["extract-requirements", "rank-evidence"]);
export type JobAiTask = typeof JobAiTask.Type;
export const AiProfile = Schema.Struct({
  ...AiExecutionFields,
  model: AiModel,
  contract: Schema.Literals([
    "river-job-analysis-v1",
    "river-job-analysis-v2",
    "river-job-analysis-v3",
    "river-job-analysis-v4",
  ]),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(12000),
  timeoutMs: Schema.Literal(60000),
});
export type AiProfile = typeof AiProfile.Type;
export const AiEvidenceCandidate = Schema.Struct({
  claimId: RecordId,
  evidenceRevisionId: RecordId,
  aggregateRevision: Revision,
  material: EvidenceMaterial,
  reviewState: ReviewState,
  decisionId: Schema.NullOr(RecordId),
  rationale: Schema.NullOr(Schema.String),
  contexts: Schema.Array(
    Schema.Struct({
      id: RecordId,
      pinnedRevisionId: RecordId,
      currentRevisionId: RecordId,
      aggregateRevision: Revision,
      data: ContextData,
    }),
  ),
});
export type AiEvidenceCandidate = typeof AiEvidenceCandidate.Type;
export const PostingAnchor = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ...PostingPassage.fields,
});
/** Address each nonempty line occurrence before generation; long lines use bounded UTF-16 spans. */
export function indexPostingPassages(posting: string, snapshotId: string) {
  return indexTextPassages(posting).map((anchor) => ({ ...anchor, snapshotId }));
}
export const JobAiInput = Schema.Struct({
  task: JobAiTask,
  jobId: RecordId,
  jobRevision: Revision,
  snapshotId: RecordId,
  workspaceRevisionId: RecordId,
  details: JobDetails,
  posting: Schema.String,
  // Missing only on the retained v1 contract and ranking inputs.
  postingAnchors: Schema.optionalKey(Schema.Array(PostingAnchor)),
  rankingPolicy: Schema.optionalKey(Schema.Literal("substantive-support-with-gaps-v1")),
  workspace: JobWorkspace,
  requirementId: Schema.NullOr(RecordId),
  candidateQuery: Schema.String,
  candidates: Schema.Array(AiEvidenceCandidate).check(Schema.isMaxLength(30)),
});
export type JobAiInput = typeof JobAiInput.Type;

// Provider objects have no optional properties; null explicitly represents an added identity or a global association.
export const RequirementProposalOutput = Schema.Struct({
  requirements: Schema.Array(
    Schema.Struct({
      existingId: Schema.NullOr(RecordId),
      ...RequirementFields.fields,
    }),
  ).check(Schema.isMaxLength(100)),
  explanation: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
const { passages: _passages, ...requirementAttributes } = RequirementFields.fields;
export const AnchoredRequirementProposalOutput = Schema.Struct({
  requirements: Schema.Array(
    Schema.Struct({
      existingId: Schema.NullOr(RecordId),
      ...requirementAttributes,
      passageIndexes: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(5),
      ),
    }),
  ).check(Schema.isMaxLength(100)),
  explanation: RequirementProposalOutput.fields.explanation,
});
export const RankingProposalOutput = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      claimId: RecordId,
      evidenceRevisionId: RecordId,
      requirementId: Schema.NullOr(RecordId),
      support: Schema.Literals(["Positive support", "Partial support"]),
      explanation: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
    }),
  ).check(Schema.isMaxLength(60)),
  gaps: Schema.Array(
    Schema.Struct({
      requirementId: RecordId,
      explanation: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
    }),
  ).check(Schema.isMaxLength(100)),
  explanation: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export const JobAiProposal = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("requirements"),
    requirements: Schema.Array(JobRequirement).check(Schema.isMaxLength(100)),
    explanation: RequirementProposalOutput.fields.explanation,
  }),
  Schema.Struct({ type: Schema.Literal("ranking"), ...RankingProposalOutput.fields }),
]);
export type JobAiProposal = typeof JobAiProposal.Type;

function decodeRequirementProposal(input: JobAiInput, output: unknown) {
  const anchors = input.postingAnchors;
  if (!anchors) return Schema.decodeUnknownSync(RequirementProposalOutput)(output);
  const generated = Schema.decodeUnknownSync(AnchoredRequirementProposalOutput)(output);
  return {
    ...generated,
    requirements: generated.requirements.map(({ passageIndexes, ...fields }) => {
      const selected = new Set<number>();
      return {
        ...fields,
        passages: passageIndexes.map((index) => {
          const anchor = anchors[index];
          if (!anchor || anchor.index !== index || selected.has(index))
            throw new ApplicationError({
              code: "InvalidInput",
              message: "The proposal selected an unknown or repeated posting passage.",
            });
          selected.add(index);
          const { index: _index, ...passage } = anchor;
          return passage;
        }),
      };
    }),
  };
}

/** Validate references against the exact supplied input. Never repair model quotes, offsets, or identity correspondence. */
export function validateJobProposal(input: JobAiInput, output: unknown): JobAiProposal {
  const invalid = (message: string): never => {
    throw new ApplicationError({ code: "InvalidInput", message });
  };
  const ids = new Set(
    input.workspace.requirements
      .filter((item) => input.task === "extract-requirements" || isQualification(item))
      .map((item) => item.id),
  );
  if (input.task === "extract-requirements") {
    const decoded = decodeRequirementProposal(input, output);
    const retained = new Set<string>();
    const requirements = decoded.requirements.map(({ existingId, ...fields }) => {
      if (existingId && (!ids.has(existingId) || retained.has(existingId)))
        invalid("The proposal contains an unknown or repeated requirement identity.");
      if (existingId) retained.add(existingId);
      if (!fields.text.trim() || !fields.category.trim() || !fields.passages.length)
        invalid("Every generated requirement must cite a complete supporting passage.");
      for (const passage of fields.passages)
        if (
          passage.snapshotId !== input.snapshotId ||
          passage.end <= passage.start ||
          input.posting.slice(passage.start, passage.end) !== passage.quote
        )
          invalid("A generated passage does not match the exact posting offsets.");
      return { id: existingId ?? newId(), ...fields };
    });
    return { type: "requirements", requirements, explanation: decoded.explanation };
  }
  const decoded = Schema.decodeUnknownSync(RankingProposalOutput)(output);
  const candidates = new Map(
    input.candidates.map((item) => [item.claimId, item.evidenceRevisionId]),
  );
  const results = new Set<string>();
  for (const result of decoded.results) {
    if (candidates.get(result.claimId) !== result.evidenceRevisionId)
      invalid("The ranking references evidence outside its supplied candidate set.");
    if (
      (result.requirementId && !ids.has(result.requirementId)) ||
      (input.requirementId && result.requirementId !== input.requirementId)
    )
      invalid("The ranking references a requirement outside its requested scope.");
    const key = `${result.claimId}:${result.requirementId ?? "general"}`;
    if (results.has(key)) invalid("The ranking repeats the same evidence association.");
    results.add(key);
  }
  const gapIds = new Set<string>();
  for (const gap of decoded.gaps) {
    if (
      !ids.has(gap.requirementId) ||
      (input.requirementId && gap.requirementId !== input.requirementId) ||
      gapIds.has(gap.requirementId)
    )
      invalid("The ranking contains an invalid gap identity.");
    gapIds.add(gap.requirementId);
  }
  if (input.rankingPolicy)
    for (const result of decoded.results)
      if (
        result.requirementId &&
        result.support === "Partial support" &&
        !gapIds.has(result.requirementId)
      )
        invalid("Every partial match must explain the remaining requirement gap.");
  for (const requirement of input.workspace.requirements.filter(
    (item) => isQualification(item) && (!input.requirementId || item.id === input.requirementId),
  ))
    if (
      !decoded.results.some((result) => result.requirementId === requirement.id) &&
      !gapIds.has(requirement.id)
    )
      invalid("The ranking must explain each requirement left unsupported by its bounded set.");
  return { type: "ranking", ...decoded };
}
