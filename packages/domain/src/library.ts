import { Schema } from "effect";
import { ApplicationError, ContentType } from "./core";

export { ContentType, contentTypes } from "./core";

import { StructuredContent, validateStructuredContent } from "./content-schema";
import { RecordId } from "./evidence";

export const LibraryKind = Schema.Literals(["content", "block", "section"]);
export type LibraryKind = typeof LibraryKind.Type;
export const LibraryReference = Schema.Struct({ itemId: RecordId, revisionId: RecordId });
export type LibraryReference = typeof LibraryReference.Type;
export const LibraryBinding = Schema.Struct({ id: RecordId, ...LibraryReference.fields });
export type LibraryBinding = typeof LibraryBinding.Type;
export const EvidenceReference = Schema.Struct({ claimId: RecordId, revisionId: RecordId });
export type EvidenceReference = typeof EvidenceReference.Type;
export const ContentData = Schema.Struct({
  kind: Schema.Literal("content"),
  type: ContentType,
  wording: Schema.NonEmptyString.check(Schema.isMaxLength(10000)),
  evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(20)),
});
export type ContentData = typeof ContentData.Type;
export const BlockFieldKey = Schema.Literals([
  "name",
  "lines",
  "paragraphs",
  "title",
  "detail",
  "dates",
  "bullets",
  "items",
]);
export type BlockFieldKey = typeof BlockFieldKey.Type;
export const BlockField = Schema.Struct({
  key: BlockFieldKey,
  contents: Schema.Array(LibraryBinding).check(Schema.isMaxLength(50)),
});
export const BlockData = Schema.Struct({
  kind: Schema.Literal("block"),
  type: ContentType,
  fields: Schema.Array(BlockField).check(Schema.isMaxLength(8)),
  structured: Schema.optional(StructuredContent),
});
export type BlockData = typeof BlockData.Type;
export const SectionData = Schema.Struct({
  kind: Schema.Literal("section"),
  type: ContentType,
  heading: Schema.String.check(Schema.isMaxLength(120)),
  blocks: Schema.Array(LibraryBinding).check(Schema.isMaxLength(30)),
  structured: Schema.optional(StructuredContent),
});
export type SectionData = typeof SectionData.Type;
export const LibraryData = Schema.Union([ContentData, BlockData, SectionData]);
export type LibraryData = typeof LibraryData.Type;
export const libraryEvidence = (data: LibraryData) =>
  data.kind === "content" ? data.evidence : (data.structured?.evidence ?? []);
interface FieldDefinition {
  key: BlockFieldKey;
  label: string;
  min: number;
  max: number;
}
interface BlockDefinition {
  label: string;
  heading: string;
  prompt: string;
  fields: readonly FieldDefinition[];
}
/** These registered slots drive validation, field pickers, and deterministic rendering. */
export const blockDefinitions = {
  contact: {
    label: "Contact / header",
    heading: "",
    prompt: "Write a name or contact line exactly as it should appear.",
    fields: [
      { key: "name", label: "Name", min: 1, max: 1 },
      { key: "lines", label: "Contact lines", min: 0, max: 12 },
    ],
  },
  summary: {
    label: "Summary",
    heading: "Summary",
    prompt: "Write one complete summary paragraph supported by your evidence.",
    fields: [{ key: "paragraphs", label: "Paragraphs", min: 1, max: 8 }],
  },
  experience: {
    label: "Experience",
    heading: "Experience",
    prompt: "Write a role title, organization detail, date label, or one accomplishment.",
    fields: [
      { key: "title", label: "Role title", min: 1, max: 1 },
      { key: "detail", label: "Organization / location", min: 0, max: 1 },
      { key: "dates", label: "Date label", min: 0, max: 1 },
      { key: "bullets", label: "Accomplishments", min: 0, max: 12 },
    ],
  },
  project: {
    label: "Projects",
    heading: "Projects",
    prompt: "Write a project title, descriptor, or one complete accomplishment.",
    fields: [
      { key: "title", label: "Project title", min: 1, max: 1 },
      { key: "detail", label: "Descriptor", min: 0, max: 1 },
      { key: "bullets", label: "Accomplishments", min: 0, max: 12 },
    ],
  },
  education: {
    label: "Education",
    heading: "Education",
    prompt: "Write an institution, qualification, date label, or education detail.",
    fields: [
      { key: "title", label: "Institution", min: 1, max: 1 },
      { key: "detail", label: "Qualification", min: 0, max: 1 },
      { key: "dates", label: "Date label", min: 0, max: 1 },
      { key: "lines", label: "Details", min: 0, max: 8 },
    ],
  },
  skill: {
    label: "Skills",
    heading: "Skills",
    prompt: "Write one skill name. A Block groups individually evidenced skills.",
    fields: [
      { key: "title", label: "Group heading", min: 0, max: 1 },
      { key: "items", label: "Individual skills", min: 1, max: 50 },
    ],
  },
  credential: {
    label: "Credentials / certifications",
    heading: "Credentials",
    prompt: "Write a credential title, issuer, date label, or credential detail.",
    fields: [
      { key: "title", label: "Credential", min: 1, max: 1 },
      { key: "detail", label: "Issuer", min: 0, max: 1 },
      { key: "dates", label: "Date label", min: 0, max: 1 },
      { key: "lines", label: "Details", min: 0, max: 4 },
    ],
  },
} as const satisfies Record<ContentType, BlockDefinition>;
export function validateLibraryData(data: LibraryData): void {
  if (data.kind !== "content" && data.structured) {
    try {
      validateStructuredContent(data.structured);
      if (data.kind === "block" ? data.fields.length : data.blocks.length)
        throw new Error("Structured content stores direct values, without legacy bindings.");
    } catch (error) {
      throw new ApplicationError({
        code: "InvalidInput",
        message: error instanceof Error ? error.message : "Check the section fields.",
      });
    }
    return;
  }
  if (data.kind === "content") {
    if (!data.wording.trim())
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Write the complete wording before saving.",
      });
    if (new Set(data.evidence.map((ref) => ref.claimId)).size !== data.evidence.length)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Link each evidence claim once, using one exact revision.",
      });
  } else if (data.kind === "block") {
    const bindingIds = data.fields.flatMap((field) => field.contents.map((ref) => ref.id));
    if (new Set(bindingIds).size !== bindingIds.length)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Each field binding needs its own stable identity.",
      });
    const definitions: readonly FieldDefinition[] = blockDefinitions[data.type].fields;
    const known = new Set(definitions.map((field) => field.key));
    if (
      new Set(data.fields.map((field) => field.key)).size !== data.fields.length ||
      data.fields.some((field) => !known.has(field.key))
    )
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Use only the registered fields for this Block type, once per field.",
      });
    for (const definition of definitions) {
      const count = data.fields.find((field) => field.key === definition.key)?.contents.length ?? 0;
      if (count < definition.min || count > definition.max)
        throw new ApplicationError({
          code: "InvalidInput",
          message: `${definition.label} requires ${definition.min}–${definition.max} content bindings.`,
        });
    }
  } else {
    if (new Set(data.blocks.map((ref) => ref.id)).size !== data.blocks.length)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Each Block binding needs its own stable identity.",
      });
    if (data.type !== "contact" && !data.heading.trim())
      throw new ApplicationError({ code: "InvalidInput", message: "Give the Section a heading." });
    if (data.type === "contact" && (data.heading !== "" || data.blocks.length > 1))
      throw new ApplicationError({
        code: "InvalidInput",
        message: "The contact Section has no printed heading and at most one header Block.",
      });
  }
}
