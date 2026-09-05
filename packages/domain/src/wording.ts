import { Schema } from "effect";
import {
  type Composition,
  ContentPlacement,
  contentValue,
  type LibraryGraphNode,
} from "./composition";
import { ApplicationError, ContentType, canonicalJson, fingerprint } from "./core";
import { RecordId } from "./evidence";
import { AiEvidenceCandidate } from "./job-ai";
import { JobDetails, PostingPassage } from "./jobs";
import { BlockFieldKey, ContentData, EvidenceReference, LibraryReference } from "./library";

export const WordingPath = Schema.Struct({
  sectionId: RecordId,
  blockId: RecordId,
  contentId: RecordId,
});
export type WordingPath = typeof WordingPath.Type;
export const WordingTarget = Schema.Struct({
  scope: Schema.Literal("content-placement-v1"),
  path: WordingPath,
  sectionType: ContentType,
  blockType: ContentType,
  field: BlockFieldKey,
  sectionReference: LibraryReference,
  blockReference: LibraryReference,
  placement: ContentPlacement,
  content: ContentData,
});
export type WordingTarget = typeof WordingTarget.Type;
export const WordingEvidence = Schema.Struct({
  ...AiEvidenceCandidate.fields,
  currentRevisionId: RecordId,
  archived: Schema.Boolean,
});
export type WordingEvidence = typeof WordingEvidence.Type;
export const WordingProfile = Schema.Struct({
  model: Schema.NonEmptyString,
  contract: Schema.Literal("river-wording-v1"),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(12000),
  timeoutMs: Schema.Literal(60000),
});
export type WordingProfile = typeof WordingProfile.Type;
export const WordingInput = Schema.Struct({
  type: Schema.Literal("wording"),
  draftId: RecordId,
  target: WordingTarget,
  targetDigest: Schema.String,
  goal: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
  snapshot: Schema.Struct({ id: RecordId, text: Schema.String, details: JobDetails }),
  evidence: Schema.Array(WordingEvidence).check(Schema.isMaxLength(20)),
});
export type WordingInput = typeof WordingInput.Type;
export const WordingProposal = Schema.Struct({
  wording: Schema.NonEmptyString.check(Schema.isMaxLength(10000)),
  evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(20)),
  reason: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
  meaning: Schema.Struct({
    assessment: Schema.Literals(["Preserved", "Changed", "Uncertain"]),
    explanation: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
  }),
  passages: Schema.Array(PostingPassage).check(Schema.isMaxLength(5)),
});
export type WordingProposal = typeof WordingProposal.Type;

/** Fingerprint only the target binding and supplied content. Sibling wording and draft names are outside this scope. */
export function captureWordingTarget(
  data: Composition,
  graph: readonly LibraryGraphNode[],
  path: WordingPath,
): WordingTarget {
  const section = data.sections.find((item) => item.id === path.sectionId);
  const block = section?.blocks.find((item) => item.id === path.blockId);
  const field = block?.fields.find((item) =>
    item.contents.some((content) => content.id === path.contentId),
  );
  const placement = field?.contents.find((item) => item.id === path.contentId);
  if (!section || !block || !field || !placement)
    throw new ApplicationError({
      code: "Conflict",
      message: "The target wording placement is no longer present.",
    });
  return {
    scope: "content-placement-v1",
    path,
    sectionType: section.type,
    blockType: block.type,
    field: field.key,
    sectionReference: section.reference,
    blockReference: block.reference,
    placement,
    content: contentValue(placement, graph),
  };
}
export const wordingTargetDigest = (target: WordingTarget) => fingerprint(canonicalJson(target));

export function validateWordingProposal(input: WordingInput, output: unknown): WordingProposal {
  const value = Schema.decodeUnknownSync(WordingProposal)(output);
  const identities = new Set<string>();
  for (const reference of value.evidence) {
    const identity = `${reference.claimId}:${reference.revisionId}`;
    if (
      identities.has(identity) ||
      !input.evidence.some(
        (item) =>
          item.claimId === reference.claimId && item.evidenceRevisionId === reference.revisionId,
      )
    )
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Proposed support must use the exact supplied evidence identities once.",
      });
    identities.add(identity);
  }
  if (!value.wording.trim())
    throw new ApplicationError({ code: "InvalidInput", message: "The proposed wording is empty." });
  for (const passage of value.passages)
    if (
      passage.snapshotId !== input.snapshot.id ||
      passage.end <= passage.start ||
      input.snapshot.text.slice(passage.start, passage.end) !== passage.quote
    )
      throw new ApplicationError({
        code: "InvalidInput",
        message: "A proposed posting passage does not match its exact quoted offsets.",
      });
  return value;
}

export function applyWordingProposal(
  data: Composition,
  path: WordingPath,
  proposal: WordingProposal,
): Composition {
  return {
    ...data,
    sections: data.sections.map((section) =>
      section.id !== path.sectionId
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) =>
              block.id !== path.blockId
                ? block
                : {
                    ...block,
                    fields: block.fields.map((field) => ({
                      ...field,
                      contents: field.contents.map((content) =>
                        content.id !== path.contentId
                          ? content
                          : {
                              ...content,
                              override: {
                                wording: proposal.wording,
                                evidence: proposal.evidence,
                                reason: proposal.reason,
                              },
                            },
                      ),
                    })),
                  },
            ),
          },
    ),
  };
}
