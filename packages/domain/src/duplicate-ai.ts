import { Schema } from "effect";
import { AiExecutionFields, AiModel } from "./ai";
import { ApplicationError, Revision } from "./core";
import { ContextData, EvidenceMaterial, RecordId, ReviewState } from "./evidence";
export const DuplicateAiProfile = Schema.Struct({
  ...AiExecutionFields,
  model: AiModel,
  contract: Schema.Literal("river-duplicate-comparison-v1"),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(8000),
  timeoutMs: Schema.Literal(60000),
});
export type DuplicateAiProfile = typeof DuplicateAiProfile.Type;
const ComparedClaim = Schema.Struct({
  claimId: RecordId,
  revision: Revision,
  evidenceRevisionId: RecordId,
  material: EvidenceMaterial,
  decision: Schema.NullOr(
    Schema.Struct({ id: RecordId, state: ReviewState, rationale: Schema.String }),
  ),
});
export const DuplicateAiInput = Schema.Struct({
  type: Schema.Literal("duplicate-comparison"),
  pair: Schema.Struct({ id: RecordId, revision: Revision }),
  first: ComparedClaim,
  second: ComparedClaim,
  contexts: Schema.Array(
    Schema.Struct({
      id: RecordId,
      revisionId: RecordId,
      aggregateRevision: Revision,
      currentRevisionId: RecordId,
      data: ContextData,
    }),
  ).check(Schema.isMaxLength(20)),
  sources: Schema.Array(
    Schema.Struct({
      id: RecordId,
      revision: Revision,
      title: Schema.String,
      kind: Schema.String,
      digest: Schema.String,
      state: Schema.String,
      currentProcessingId: Schema.NullOr(RecordId),
    }),
  ).check(Schema.isMaxLength(40)),
});
export type DuplicateAiInput = typeof DuplicateAiInput.Type;
const Explanation = Schema.NonEmptyString.check(Schema.isMaxLength(4000));
const Findings = Schema.Array(
  Schema.Struct({
    scope: Schema.Literals(["Assertion", "Citation", "Context"]),
    explanation: Explanation,
  }),
).check(Schema.isMaxLength(12));
export const DuplicateAiOutput = Schema.Struct({
  assessment: Schema.Literals(["Same fact", "Different facts", "Uncertain"]),
  shared: Findings,
  different: Findings,
  uncertain: Findings,
});
export type DuplicateAiOutput = typeof DuplicateAiOutput.Type;
export function validateDuplicateComparison(output: unknown) {
  const value = Schema.decodeUnknownSync(DuplicateAiOutput)(output);
  const findings = [...value.shared, ...value.different, ...value.uncertain];
  if (!findings.length || findings.some((item) => !item.explanation.trim()))
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Comparison explanations cannot be blank.",
    });
  return value;
}
