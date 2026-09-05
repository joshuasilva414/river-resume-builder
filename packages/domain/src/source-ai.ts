import { Schema } from "effect";
import { ApplicationError, Revision } from "./core";
import {
  CitationLocator,
  ContextData,
  EvidenceMaterial,
  EvidenceMaterialInput,
  EvidenceMetadata,
  RecordId,
  resolveCitation,
} from "./evidence";
export const SourceAiProfile = Schema.Struct({
  model: Schema.NonEmptyString,
  contract: Schema.Literal("river-source-claims-v1"),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(12000),
  timeoutMs: Schema.Literal(60000),
});
export type SourceAiProfile = typeof SourceAiProfile.Type;
export const SourceAiInput = Schema.Struct({
  type: Schema.Literal("source-claims"),
  focus: Schema.String.check(Schema.isMaxLength(2000)),
  source: Schema.Struct({
    id: RecordId,
    revision: Revision,
    digest: Schema.String,
    title: Schema.String,
    kind: Schema.Literals(["document", "pasted", "structured", "attestation"]),
    processingId: RecordId,
    processingDigest: Schema.String,
    parser: Schema.String,
    parserVersion: Schema.String,
    text: Schema.String,
    segments: Schema.Array(CitationLocator),
  }),
  contexts: Schema.Array(
    Schema.Struct({
      id: RecordId,
      revisionId: RecordId,
      aggregateRevision: Revision,
      data: ContextData,
    }),
  ).check(Schema.isMaxLength(10)),
});
export type SourceAiInput = typeof SourceAiInput.Type;
const Explanation = Schema.NonEmptyString.check(Schema.isMaxLength(4000));
export const SourceCandidateOutput = Schema.Struct({
  material: EvidenceMaterialInput,
  metadata: EvidenceMetadata,
  explanation: Explanation,
  questions: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(2000))).check(
    Schema.isMaxLength(5),
  ),
});
export const SourceAiOutput = Schema.Struct({
  candidates: Schema.Array(SourceCandidateOutput).check(Schema.isMaxLength(20)),
});
export const SourceCandidate = Schema.Struct({
  ...SourceCandidateOutput.fields,
  material: EvidenceMaterial,
});
export type SourceCandidate = typeof SourceCandidate.Type;
/** Validate and resolve exact original occurrences; never repair quotations or infer locators from model text. */
export function validateSourceCandidates(
  input: SourceAiInput,
  output: unknown,
): readonly SourceCandidate[] {
  const decoded = Schema.decodeUnknownSync(SourceAiOutput)(output);
  const invalid = (message: string): never => {
    throw new ApplicationError({ code: "InvalidInput", message });
  };
  return decoded.candidates.map((candidate) => {
    if (!candidate.material.assertion.trim() || !candidate.material.citations.length)
      invalid("Each proposed claim must contain an assertion and exact source citation.");
    const keys = new Set<string>();
    const citations = candidate.material.citations.map((citation) => {
      const key = `${citation.start}:${citation.end}`;
      if (
        citation.sourceId !== input.source.id ||
        citation.processingId !== input.source.processingId ||
        keys.has(key)
      )
        invalid(
          "Proposed citations must identify distinct occurrences in the supplied processing result.",
        );
      keys.add(key);
      return resolveCitation(citation, input.source, input.source.kind === "attestation");
    });
    const contexts = new Set<string>();
    for (const ref of candidate.material.contexts) {
      if (
        contexts.has(ref.id) ||
        !input.contexts.some(
          (context) => context.id === ref.id && context.revisionId === ref.revisionId,
        )
      )
        invalid("Proposed context must use each selected exact context revision once.");
      contexts.add(ref.id);
    }
    if (
      candidate.questions.some((question) => !question.trim()) ||
      new Set(candidate.questions).size !== candidate.questions.length
    )
      invalid("Clarification questions must be nonblank and distinct.");
    return { ...candidate, material: { ...candidate.material, citations } };
  });
}
