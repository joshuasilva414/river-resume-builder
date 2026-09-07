import { Schema } from "effect";
import { ApplicationError, canonicalJson, newId, type ResumeDocument, Theme } from "./core";
import { RecordId } from "./evidence";
import {
  BlockFieldKey,
  type ContentData,
  ContentType,
  EvidenceReference,
  type LibraryData,
  LibraryReference,
  validateLibraryData,
} from "./library";

const Reason = Schema.NonEmptyString.check(Schema.isMaxLength(4000));
export const ContentOverride = Schema.Struct({
  wording: Schema.NonEmptyString.check(Schema.isMaxLength(10000)),
  evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(20)),
  reason: Reason,
});
export const ContentPlacement = Schema.Struct({
  id: RecordId,
  reference: LibraryReference,
  override: Schema.NullOr(ContentOverride),
});
export type ContentPlacement = typeof ContentPlacement.Type;
export const BlockPlacement = Schema.Struct({
  id: RecordId,
  reference: LibraryReference,
  type: ContentType,
  reason: Schema.NullOr(Reason),
  fields: Schema.Array(
    Schema.Struct({
      key: BlockFieldKey,
      contents: Schema.Array(ContentPlacement).check(Schema.isMaxLength(50)),
    }),
  ).check(Schema.isMaxLength(8)),
});
export type BlockPlacement = typeof BlockPlacement.Type;
export const SectionPlacement = Schema.Struct({
  id: RecordId,
  reference: LibraryReference,
  type: ContentType,
  reason: Schema.NullOr(Reason),
  heading: Schema.String.check(Schema.isMaxLength(120)),
  blocks: Schema.Array(BlockPlacement).check(Schema.isMaxLength(30)),
});
export type SectionPlacement = typeof SectionPlacement.Type;
export const Composition = Schema.Struct({
  name: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  theme: Theme,
  templateRevision: Schema.Literal(1),
  template: Schema.optional(Schema.Struct({ designId: RecordId, revisionId: RecordId })),
  sections: Schema.Array(SectionPlacement).check(Schema.isMaxLength(20)),
});
export type Composition = typeof Composition.Type;
export interface LibraryGraphNode {
  item: { id: string; currentRevisionId: string };
  revision: { id: string; data: LibraryData };
}

export function resolveLibrary(reference: LibraryReference, graph: readonly LibraryGraphNode[]) {
  const node = graph.find(
    (node) => node.item.id === reference.itemId && node.revision.id === reference.revisionId,
  );
  if (!node)
    throw new ApplicationError({
      code: "NotFound",
      message: "A pinned library revision is unavailable.",
    });
  return node.revision.data;
}
export function placeContent(reference: LibraryReference, createId = newId): ContentPlacement {
  return { id: createId(), reference, override: null };
}
export function placeBlock(
  reference: LibraryReference,
  graph: readonly LibraryGraphNode[],
  createId = newId,
): BlockPlacement {
  const data = resolveLibrary(reference, graph);
  if (data.kind !== "block")
    throw new ApplicationError({ code: "InvalidInput", message: "Choose a reusable Block." });
  return {
    id: createId(),
    reference,
    type: data.type,
    reason: null,
    fields: data.fields.map((field) => ({
      key: field.key,
      contents: field.contents.map((ref) =>
        placeContent({ itemId: ref.itemId, revisionId: ref.revisionId }, createId),
      ),
    })),
  };
}
export function placeSection(
  reference: LibraryReference,
  graph: readonly LibraryGraphNode[],
  createId = newId,
): SectionPlacement {
  const data = resolveLibrary(reference, graph);
  if (data.kind !== "section")
    throw new ApplicationError({ code: "InvalidInput", message: "Choose a reusable Section." });
  return {
    id: createId(),
    reference,
    type: data.type,
    reason: null,
    heading: data.heading,
    blocks: data.blocks.map((ref) =>
      placeBlock({ itemId: ref.itemId, revisionId: ref.revisionId }, graph, createId),
    ),
  };
}
/** Copies retain all visible local values and base references while giving every placement a new identity. */
export function copySection(section: SectionPlacement): SectionPlacement {
  return { ...section, id: newId(), blocks: section.blocks.map(copyBlock) };
}
export function copyBlock(block: BlockPlacement): BlockPlacement {
  return {
    ...block,
    id: newId(),
    fields: block.fields.map((field) => ({
      ...field,
      contents: field.contents.map((content) => ({ ...content, id: newId() })),
    })),
  };
}
export function compositionReferences(data: Composition): readonly LibraryReference[] {
  return data.sections.flatMap((section) => [
    section.reference,
    ...section.blocks.flatMap((block) => [
      block.reference,
      ...block.fields.flatMap((field) => field.contents.map((content) => content.reference)),
    ]),
  ]);
}
export function contentValue(
  content: ContentPlacement,
  graph: readonly LibraryGraphNode[],
): ContentData {
  const base = resolveLibrary(content.reference, graph);
  if (base.kind !== "content")
    throw new ApplicationError({
      code: "InvalidInput",
      message: "A wording binding must reference Content.",
    });
  return content.override
    ? { ...base, wording: content.override.wording, evidence: content.override.evidence }
    : base;
}
const refShape = (reference: LibraryReference) => ({
  itemId: reference.itemId,
  revisionId: reference.revisionId,
});
function fail(message: string): never {
  throw new ApplicationError({ code: "InvalidInput", message });
}
/** Validate both visible composition and its claimed relationship to every immutable base revision. */
export function validateComposition(data: Composition, graph: readonly LibraryGraphNode[]) {
  if (!data.name.trim()) fail("Name this résumé draft.");
  if (new TextEncoder().encode(canonicalJson(data)).byteLength > 512 * 1024)
    fail("The draft exceeds its 512 KiB composition limit.");
  const identities = new Set<string>();
  const identity = (id: string) => {
    if (identities.has(id)) fail("Every placement needs a unique identity.");
    identities.add(id);
    if (identities.size > 500) fail("The draft exceeds 500 placements.");
  };
  let contact = 0;
  for (const section of data.sections) {
    identity(section.id);
    const base = resolveLibrary(section.reference, graph);
    if (base.kind !== "section" || base.type !== section.type)
      fail("Section type and base revision must agree.");
    if (section.type === "contact" && (++contact > 1 || data.sections[0]?.id !== section.id))
      fail("Use one contact/header Section, first in reading order.");
    validateLibraryData({
      kind: "section",
      type: section.type,
      heading: section.heading,
      blocks: section.blocks.map((block) => ({ id: block.id, ...block.reference })),
    });
    if (
      !section.reason &&
      (section.heading !== base.heading ||
        canonicalJson(section.blocks.map((block) => refShape(block.reference))) !==
          canonicalJson(base.blocks.map(refShape)))
    )
      fail("A changed Section composition needs a local override reason.");
    if (section.reason !== null && !section.reason.trim())
      fail("Describe the local Section change.");
    for (const block of section.blocks) {
      identity(block.id);
      const original = resolveLibrary(block.reference, graph);
      if (original.kind !== "block" || original.type !== block.type || block.type !== section.type)
        fail("Choose a Block compatible with this Section.");
      validateLibraryData({
        kind: "block",
        type: block.type,
        fields: block.fields.map((field) => ({
          key: field.key,
          contents: field.contents.map((content) => ({ id: content.id, ...content.reference })),
        })),
      });
      const shape = (fields: readonly { key: string; contents: readonly LibraryReference[] }[]) =>
        [...fields]
          .filter((field) => field.contents.length)
          .map((field) => ({ key: field.key, contents: field.contents.map(refShape) }))
          .sort((a, b) => a.key.localeCompare(b.key));
      if (
        !block.reason &&
        canonicalJson(
          shape(
            block.fields.map((field) => ({
              key: field.key,
              contents: field.contents.map((content) => content.reference),
            })),
          ),
        ) !== canonicalJson(shape(original.fields))
      )
        fail("A changed Block composition needs a local override reason.");
      if (block.reason !== null && !block.reason.trim()) fail("Describe the local Block change.");
      for (const field of block.fields)
        for (const content of field.contents) {
          identity(content.id);
          const value = contentValue(content, graph);
          if (value.type !== block.type) fail("Choose wording compatible with the Block type.");
          validateLibraryData(value);
          if (content.override && !content.override.reason.trim())
            fail("Describe the local wording change.");
        }
    }
  }
}
/** Resolve registered fields in deterministic reading order; no mutable evidence or profile reads. */
export function renderComposition(
  data: Composition,
  graph: readonly LibraryGraphNode[],
): ResumeDocument {
  validateComposition(data, graph);
  const contact = data.sections.find((section) => section.type === "contact")?.blocks[0];
  if (!contact) fail("Add your name in a contact section before previewing.");
  const words = (block: BlockPlacement, key: string) =>
    (block.fields.find((field) => field.key === key)?.contents ?? []).map(
      (content) => contentValue(content, graph).wording,
    );
  const name = words(contact, "name")[0];
  if (!name) fail("Add a name to the contact/header Block.");
  const document: ResumeDocument = {
    textLocators: data.sections.flatMap((section) => [
      ...(section.type !== "contact" && section.blocks.length
        ? [{ locator: `${section.id}/heading`, text: section.heading }]
        : []),
      ...section.blocks.flatMap((block) =>
        ["name", "title", "detail", "dates", "paragraphs", "lines", "items", "bullets"].flatMap(
          (key) =>
            (block.fields.find((field) => field.key === key)?.contents ?? []).map((content) => ({
              locator: `${section.id}/${block.id}/${key}/${content.id}`,
              text: contentValue(content, graph).wording,
            })),
        ),
      ),
    ]),
    name,
    contact: words(contact, "lines"),
    sections: data.sections
      .filter((section) => section.type !== "contact" && section.blocks.length > 0)
      .map((section) => ({
        type: section.type,
        locator: section.id,
        heading: section.heading,
        blocks: section.blocks.map((block) => ({
          type: block.type,
          locator: block.id,
          heading: words(block, "title").join(""),
          detail: [...words(block, "detail"), ...words(block, "dates")].join(" · "),
          paragraphs: [
            ...words(block, "paragraphs"),
            ...words(block, "lines"),
            ...(words(block, "items").length ? [words(block, "items").join(" · ")] : []),
          ],
          bullets: words(block, "bullets"),
        })),
      })),
  };
  if (canonicalJson(document).length > 100000)
    fail("The resolved document exceeds 100,000 characters.");
  return document;
}
export function compositionEvidence(data: Composition, graph: readonly LibraryGraphNode[]) {
  return data.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.fields.flatMap((field) =>
        field.contents.flatMap((content) => contentValue(content, graph).evidence),
      ),
    ),
  );
}
