import {
  ApplicationError,
  blockDefinitions,
  type Composition,
  canonicalJson,
  contentValue,
  EvidenceReference,
  fingerprint,
  type LibraryGraphNode,
  RecordId,
  renderComposition,
  type SourceField,
  SourceFields,
  validateIntendedText,
} from "@river/domain";
import { diffLines } from "diff";
import { Schema } from "effect";
import { normalizeText, textLocations } from "./index";

const fail = (message: string): never => {
  throw new ApplicationError({ code: "InvalidInput", message });
};
export const SourceRefinementProfile = Schema.Struct({
  model: Schema.NonEmptyString,
  contract: Schema.Literal("river-source-refinement-v1"),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(24000),
  timeoutMs: Schema.Literal(60000),
});
export type SourceRefinementProfile = typeof SourceRefinementProfile.Type;
export const SourceMeaning = Schema.Struct({
  assessment: Schema.Literals(["Preserved", "Changed", "Uncertain"]),
  explanation: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
});
export type SourceMeaning = typeof SourceMeaning.Type;
export const SourceRefinementOutput = Schema.Struct({
  source: Schema.NonEmptyString.check(Schema.isMaxLength(250000)),
  fields: Schema.Array(
    Schema.Struct({
      baseLocator: Schema.NullOr(Schema.NonEmptyString.check(Schema.isMaxLength(300))),
      text: Schema.NonEmptyString.check(Schema.isMaxLength(20000)),
      evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(20)),
      meaning: SourceMeaning,
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  explanation: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export type SourceRefinementOutput = typeof SourceRefinementOutput.Type;

/** Resolve exact structured fields once. The first registered minimum fields keep their obligations. */
export function structuredSourceFields(
  data: Composition,
  graph: readonly LibraryGraphNode[],
): SourceFields {
  const metadata = new Map<string, Omit<SourceField, "locator" | "text">>();
  for (const section of data.sections) {
    metadata.set(`${section.id}/heading`, {
      origin: "structured",
      role: "heading",
      required: true,
      evidence: [],
      reviewRequired: false,
    });
    for (const block of section.blocks)
      for (const field of block.fields) {
        const definition = blockDefinitions[block.type].fields.find(
          (item) => item.key === field.key,
        );
        for (const [index, content] of field.contents.entries())
          metadata.set(`${section.id}/${block.id}/${field.key}/${content.id}`, {
            origin: "structured",
            role: "content",
            required: index < (definition?.min ?? 0),
            evidence: contentValue(content, graph).evidence,
            reviewRequired: false,
          });
      }
  }
  return textLocations(renderComposition(data, graph)).map((location) => {
    const field = metadata.get(location.locator);
    if (!field) throw new Error("Structured field metadata is incomplete.");
    return { ...location, ...field };
  });
}

export function validateSourceFields(fields: SourceFields) {
  Schema.decodeUnknownSync(SourceFields)(fields);
  validateIntendedText(fields);
  if (fields.some((field) => !normalizeText(field.text)))
    fail("Each intended field must contain text after document normalization.");
  for (const field of fields) {
    const ids = field.evidence.map((ref) => `${ref.claimId}/${ref.revisionId}`);
    if (new Set(ids).size !== ids.length) fail("A field cannot repeat the same evidence identity.");
  }
}

/** No model-assigned locator, required-field flag or meaning claim can grant source provenance. */
export function captureSourceCandidate(
  base: SourceFields,
  allowedEvidence: readonly EvidenceReference[],
  candidateId: string,
  output: unknown,
) {
  Schema.decodeUnknownSync(RecordId)(candidateId);
  validateSourceFields(base);
  const value = Schema.decodeUnknownSync(SourceRefinementOutput)(output);
  if (canonicalJson(value).length > 200000)
    fail("The complete source proposal exceeds its output limit.");
  // Keep schema-valid source reviewable even when compilation will reject it. The document boundary enforces the LaTeX grammar before execution.
  const prior = new Map(base.map((field) => [field.locator, field])),
    seen = new Set<string>(),
    allowed = new Set(allowedEvidence.map((ref) => `${ref.claimId}/${ref.revisionId}`));
  const fields = value.fields.map((item, index): SourceField => {
    const original = item.baseLocator === null ? undefined : prior.get(item.baseLocator);
    if (item.baseLocator !== null && (!original || seen.has(item.baseLocator)))
      fail("Each retained field must identify an exact base locator once.");
    if (item.baseLocator !== null) seen.add(item.baseLocator);
    if (item.evidence.some((ref) => !allowed.has(`${ref.claimId}/${ref.revisionId}`)))
      fail("Proposed support must use exact evidence identities captured with this checkpoint.");
    if (original?.role === "heading" && item.evidence.length)
      fail("A heading cannot acquire claim support through source refinement.");
    return {
      locator: original?.locator ?? `source/${candidateId}/added/${index}`,
      text: item.text,
      origin: original?.origin ?? "source",
      role: original?.role ?? "content",
      required: original?.required ?? false,
      evidence: item.evidence,
      reviewRequired:
        !original ||
        original.reviewRequired ||
        original.text !== item.text ||
        canonicalJson(original.evidence) !== canonicalJson(item.evidence),
    };
  });
  if (base.some((field) => field.required && !seen.has(field.locator)))
    fail("A required structured field was removed from the intended-text manifest.");
  validateSourceFields(fields);
  return {
    source: value.source,
    fields,
    meaning: value.fields.map((field, index) => ({
      locator: field.baseLocator ?? `source/${candidateId}/added/${index}`,
      ...field.meaning,
    })),
    explanation: value.explanation,
  };
}
export type SourceRefinementCandidate = ReturnType<typeof captureSourceCandidate>;

export interface CompleteTextDiff {
  readonly mode: "lines" | "complete-replacement";
  readonly segments: readonly {
    id: string;
    kind: "Unchanged" | "Removed" | "Added";
    text: string;
    beforeStart: number;
    beforeEnd: number;
    afterStart: number;
    afterEnd: number;
  }[];
}
/** Bounded diffing always preserves both complete inputs, including whitespace and the preamble. */
export function completeTextDiff(
  before: string,
  after: string,
  namespace: string,
): CompleteTextDiff {
  if (before.length > 250000 || after.length > 250000)
    fail("The comparison exceeds its text limit.");
  const manageable = before.split("\n").length + after.split("\n").length <= 10000;
  const changes = manageable ? diffLines(before, after, { maxEditLength: 2000 }) : undefined;
  const parts = changes ?? [
    { removed: true, added: false, value: before },
    { removed: false, added: true, value: after },
  ];
  let left = 0,
    right = 0;
  return {
    mode: changes ? "lines" : "complete-replacement",
    segments: parts
      .filter((part) => part.value.length > 0)
      .map((part) => {
        const beforeStart = left,
          afterStart = right;
        if (!part.added) left += part.value.length;
        if (!part.removed) right += part.value.length;
        return {
          id: `${namespace}/${beforeStart}-${left}/${afterStart}-${right}`,
          kind: part.added ? "Added" : part.removed ? "Removed" : "Unchanged",
          text: part.value,
          beforeStart,
          beforeEnd: left,
          afterStart,
          afterEnd: right,
        };
      }),
  };
}

export function compareSourceCandidate(
  base: { source: string; fields: SourceFields; extractedText: string },
  candidate: SourceRefinementCandidate,
  extractedText: string,
) {
  const previous = new Map(base.fields.map((field, index) => [field.locator, { field, index }])),
    next = new Map(candidate.fields.map((field, index) => [field.locator, { field, index }]));
  const fields = [...new Set([...previous.keys(), ...next.keys()])].map((locator) => {
    const left = previous.get(locator),
      right = next.get(locator);
    const meaning = candidate.meaning.find((item) => item.locator === locator) ?? null;
    const textChanged = left?.field.text !== right?.field.text,
      supportChanged =
        canonicalJson(left?.field.evidence ?? []) !== canonicalJson(right?.field.evidence ?? []);
    return {
      id: `manifest/${locator}`,
      locator,
      before: left?.field ?? null,
      after: right?.field ?? null,
      beforeIndex: left?.index ?? null,
      afterIndex: right?.index ?? null,
      textChanged,
      supportChanged,
      moved: Boolean(left && right && left.index !== right.index),
      classification:
        textChanged || supportChanged
          ? meaning?.assessment === "Preserved" && !supportChanged
            ? "Wording"
            : meaning?.assessment === "Changed"
              ? "Factual"
              : "Uncertain"
          : "Layout",
      meaning,
    } as const;
  });
  const intendedUnchanged = canonicalJson(base.fields) === canonicalJson(candidate.fields),
    extractedUnchanged = base.extractedText === extractedText;
  return {
    version: "river-source-review-v1" as const,
    source: completeTextDiff(base.source, candidate.source, "source"),
    fields,
    extracted: completeTextDiff(base.extractedText, extractedText, "extracted"),
    layoutOnly: intendedUnchanged && extractedUnchanged,
    intendedUnchanged,
    extractedUnchanged,
    changedFields: fields.filter(
      (field) => field.textChanged || field.supportChanged || field.moved,
    ).length,
  };
}
export type SourceComparison = ReturnType<typeof compareSourceCandidate>;
export const sourceCandidateDigest = (candidate: SourceRefinementCandidate) =>
  fingerprint(canonicalJson(candidate));
