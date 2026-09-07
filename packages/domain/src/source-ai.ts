import { Schema } from "effect";
import { AiExecutionFields, AiModel } from "./ai";
import { ApplicationError, Revision } from "./core";
import {
  CitationInput,
  CitationLocator,
  ContextData,
  EvidenceMaterial,
  EvidenceMaterialInput,
  EvidenceMetadata,
  RecordId,
  resolveCitation,
} from "./evidence";
import { indexTextPassages } from "./text-passages";
export const SourceAiProfile = Schema.Struct({
  ...AiExecutionFields,
  model: AiModel,
  contract: Schema.Literals(["river-source-claims-v1", "river-source-claims-v2"]),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(12000),
  timeoutMs: Schema.Literal(60000),
});
export type SourceAiProfile = typeof SourceAiProfile.Type;
export const SourcePassageAnchor = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ...CitationInput.fields,
});
export function indexSourcePassages(text: string, sourceId: string, processingId: string) {
  return indexTextPassages(text).map((anchor) => ({ ...anchor, sourceId, processingId }));
}
export const SourceAiInput = Schema.Struct({
  type: Schema.Literal("source-claims"),
  focus: Schema.String.check(Schema.isMaxLength(2000)),
  // Retained v1 tasks predate occurrence anchors and remain readable under their original contract.
  sourceAnchors: Schema.optionalKey(Schema.Array(SourcePassageAnchor)),
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
const { citations: _citations, ...materialFields } = EvidenceMaterialInput.fields;
export const AnchoredSourceAiOutput = Schema.Struct({
  candidates: Schema.Array(
    Schema.Struct({
      ...SourceCandidateOutput.fields,
      material: Schema.Struct({
        ...materialFields,
        passageIndexes: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(
          Schema.isMinLength(1),
          Schema.isMaxLength(20),
        ),
      }),
    }),
  ).check(Schema.isMaxLength(20)),
});
export const SourceCandidate = Schema.Struct({
  ...SourceCandidateOutput.fields,
  material: EvidenceMaterial,
});
export type SourceCandidate = typeof SourceCandidate.Type;
function decodeSourceCandidates(input: SourceAiInput, output: unknown) {
  const anchors = input.sourceAnchors;
  if (!anchors) return Schema.decodeUnknownSync(SourceAiOutput)(output);
  const generated = Schema.decodeUnknownSync(AnchoredSourceAiOutput)(output);
  return {
    candidates: generated.candidates.map((candidate) => {
      const { passageIndexes, ...material } = candidate.material;
      const selected = new Set<number>();
      return {
        ...candidate,
        material: {
          ...material,
          citations: passageIndexes.map((index) => {
            const anchor = anchors[index];
            if (!anchor || anchor.index !== index || selected.has(index))
              throw new ApplicationError({
                code: "InvalidInput",
                message: "The proposal selected an unknown or repeated source passage.",
              });
            selected.add(index);
            const { index: _index, ...citation } = anchor;
            return citation;
          }),
        },
      };
    }),
  };
}
/** Validate and resolve exact original occurrences; never repair quotations or infer locators from model text. */
export function validateSourceCandidates(
  input: SourceAiInput,
  output: unknown,
): readonly SourceCandidate[] {
  const decoded = decodeSourceCandidates(input, output);
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
