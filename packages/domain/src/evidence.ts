import { Schema } from "effect";
import { ApplicationError } from "./core";

export const RecordId = Schema.String.check(Schema.isUUID(7));
const shortText = Schema.String.check(Schema.isMaxLength(200));
export const ReviewState = Schema.Literals(["Draft", "Needs clarification", "Verified"]);
export type ReviewState = typeof ReviewState.Type;
export const ContextKind = Schema.Literals([
  "Owner Profile",
  "Employment",
  "Project",
  "Education",
  "Credential",
]);
export const ContextData = Schema.Struct({
  kind: ContextKind,
  label: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  organization: shortText,
  role: shortText,
  startDate: Schema.String.check(Schema.isMaxLength(32)),
  endDate: Schema.String.check(Schema.isMaxLength(32)),
  details: Schema.String.check(Schema.isMaxLength(4000)),
  contact: Schema.NullOr(
    Schema.Struct({
      email: shortText,
      phone: shortText,
      location: shortText,
      links: Schema.Array(Schema.String.check(Schema.isMaxLength(2048))).check(
        Schema.isMaxLength(10),
      ),
    }),
  ),
});
export type ContextData = typeof ContextData.Type;
export const ContextReference = Schema.Struct({ id: RecordId, revisionId: RecordId });
export const CitationInput = Schema.Struct({
  sourceId: RecordId,
  processingId: RecordId,
  quote: Schema.NonEmptyString.check(Schema.isMaxLength(10000)),
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  end: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type CitationInput = typeof CitationInput.Type;
export const CitationLocator = Schema.Struct({
  start: Schema.Int,
  end: Schema.Int,
  page: Schema.optional(Schema.Int),
  line: Schema.optional(Schema.Int),
});
export const EvidenceCitation = Schema.Struct({
  ...CitationInput.fields,
  locators: Schema.Array(CitationLocator),
  attestation: Schema.Boolean,
});
export type EvidenceCitation = typeof EvidenceCitation.Type;
export const EvidenceMaterialInput = Schema.Struct({
  assertion: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
  citations: Schema.Array(CitationInput).check(Schema.isMaxLength(20)),
  contexts: Schema.Array(ContextReference).check(Schema.isMaxLength(10)),
});
export type EvidenceMaterialInput = typeof EvidenceMaterialInput.Type;
export const EvidenceMaterial = Schema.Struct({
  ...EvidenceMaterialInput.fields,
  citations: Schema.Array(EvidenceCitation),
});
export type EvidenceMaterial = typeof EvidenceMaterial.Type;
export const EvidenceMetadata = Schema.Struct({
  label: shortText,
  tags: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(60))).check(
    Schema.isMaxLength(20),
  ),
  notes: Schema.String.check(Schema.isMaxLength(4000)),
});
export type EvidenceMetadata = typeof EvidenceMetadata.Type;
export interface CommandOutcome {
  readonly id: string;
  readonly revision: number;
  readonly revisionId: string | null;
}

/** Offsets use UTF-16 code units, matching stored extraction strings and browser selections. */
export function resolveCitation(
  input: CitationInput,
  extraction: { text: string; segments: readonly (typeof CitationLocator.Type)[] },
  attestation: boolean,
): EvidenceCitation {
  if (
    input.end <= input.start ||
    input.end > extraction.text.length ||
    extraction.text.slice(input.start, input.end) !== input.quote
  )
    throw new ApplicationError({
      code: "InvalidInput",
      message:
        "The citation no longer matches those exact source offsets. Select the passage again.",
    });
  return {
    ...input,
    attestation,
    locators: extraction.segments
      .filter((segment) => segment.end > input.start && segment.start < input.end)
      .map(({ start, end, page, line }) => ({
        start,
        end,
        ...(page === undefined ? {} : { page }),
        ...(line === undefined ? {} : { line }),
      })),
  };
}

export function requireReview(material: EvidenceMaterial, state: ReviewState, rationale: string) {
  if (!rationale.trim())
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Record the reason for this review decision.",
    });
  if (state === "Verified" && material.citations.length === 0)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Verification requires at least one exact source citation.",
    });
}

/** A review candidate only. Similarity never merges records or verifies assertions. */
export function duplicateSimilarity(first: string, second: string): number {
  const words = (value: string) =>
    new Set(
      value
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? [],
    );
  const a = words(first);
  const b = words(second);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
}

export function evidenceIsStale(pinnedRevisionId: string, currentRevisionId: string): boolean {
  return pinnedRevisionId !== currentRevisionId;
}
