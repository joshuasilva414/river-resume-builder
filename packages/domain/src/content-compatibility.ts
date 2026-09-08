import {
  contentValue,
  type LibraryGraphNode,
  resolveLibrary,
  type SectionPlacement,
} from "./composition";
import { builtInSchemaBundle, emptyStructuredContent } from "./content-defaults";
import {
  type ContentRecord,
  type ContentValues,
  readLegacyDate,
  type StructuredContent,
} from "./content-schema";
import { newId } from "./core";
import {
  type BlockData,
  type LibraryData,
  type LibraryReference,
  libraryEvidence,
} from "./library";

/** Legacy wrappers are adapted on edit; saved historical graphs are never rewritten. */
export function adaptLibraryContent(
  data: LibraryData,
  graph: readonly LibraryGraphNode[],
  id = newId(),
): StructuredContent {
  if (data.kind === "content") throw new Error("Choose an entry or section.");
  if (data.structured) return data.structured;
  const content = emptyStructuredContent(data.type, id);
  const word = (reference: LibraryReference) => {
    const value = resolveLibrary(reference, graph);
    if (value.kind !== "content") throw new Error("Legacy wording is unavailable.");
    return value.wording;
  };
  const words = (block: BlockData, key: string) =>
    (block.fields.find((field) => field.key === key)?.contents ?? []).map(word);
  const convertBlock = (block: BlockData, recordId: string): ContentRecord => {
    if (block.structured) return block.structured.record;
    const title = words(block, "title").join(""),
      detail = words(block, "detail").join("");
    const dates = words(block, "dates").join("");
    const values: Record<string, (typeof ContentValues.Type)[string]> = {};
    if (block.type === "experience")
      Object.assign(values, { employer: detail, title, accomplishments: words(block, "bullets") });
    if (block.type === "project")
      Object.assign(values, {
        project: title,
        description: detail,
        accomplishments: words(block, "bullets"),
      });
    if (block.type === "education")
      Object.assign(values, { institution: title, degree: detail, details: words(block, "lines") });
    if (block.type === "credential")
      Object.assign(values, { credential: title, issuer: detail, details: words(block, "lines") });
    if (dates)
      values[block.type === "credential" ? "issuedDate" : "endDate"] = readLegacyDate(dates);
    return {
      id: recordId,
      schema: { id: `${block.type}-entry`, revision: 1 },
      layout: { id: `${block.type}-entry-classic`, revision: 1 },
      values,
    };
  };
  const blocks =
    data.kind === "block"
      ? [data]
      : data.blocks.map((ref) => {
          const block = resolveLibrary(ref, graph);
          if (block.kind !== "block") throw new Error("Legacy entry is unavailable.");
          return block;
        });
  const collectEvidence = (value: LibraryData): ReturnType<typeof libraryEvidence> => {
    const children =
      value.kind === "content"
        ? []
        : value.kind === "block"
          ? value.fields.flatMap((field) => field.contents)
          : value.blocks;
    return [
      ...libraryEvidence(value),
      ...children.flatMap((reference) => collectEvidence(resolveLibrary(reference, graph))),
    ];
  };
  const evidence = [...new Map(collectEvidence(data).map((ref) => [ref.claimId, ref])).values()];
  if (data.kind === "block" && !["summary", "contact", "skill"].includes(data.type))
    return { ...builtInSchemaBundle, record: convertBlock(data, id), evidence };
  let values: ContentValues = {
    heading: data.kind === "section" ? data.heading : (content.record.values.heading ?? ""),
  };
  if (data.type === "summary")
    values = {
      ...values,
      summary: blocks.flatMap((block) => words(block, "paragraphs")).join("\n\n"),
    };
  else if (data.type === "skill")
    values = {
      ...values,
      skills: blocks.flatMap((block) => [...words(block, "title"), ...words(block, "items")]),
    };
  else if (data.type === "contact") {
    values = {
      name: blocks.flatMap((block) => words(block, "name")).join(""),
      legacyContact: blocks.flatMap((block) => words(block, "lines")),
    };
    return {
      ...content,
      schemas: content.schemas.map((schema) =>
        schema.id === "contact-section"
          ? {
              ...schema,
              fields: [
                ...schema.fields,
                {
                  id: "legacyContact",
                  label: "Existing contact text",
                  required: false,
                  kind: "list",
                  items: "text",
                },
              ],
            }
          : schema,
      ),
      layouts: content.layouts.map((layout) =>
        layout.schema.id === "contact-section"
          ? { ...layout, source: `${layout.source}\n{{legacyContact}}` }
          : layout,
      ),
      record: { ...content.record, values },
      evidence,
    };
  } else values = { ...values, entries: blocks.map((block) => convertBlock(block, newId())) };
  return { ...content, record: { ...content.record, values }, evidence };
}

/** Convert the visible local section, including overrides, without changing its saved base. */
export function adaptCompositionSection(
  section: SectionPlacement,
  graph: readonly LibraryGraphNode[],
): StructuredContent {
  if (section.structured) return section.structured;
  const visible: LibraryGraphNode[] = section.blocks.flatMap((block) => [
    {
      item: { id: block.id, currentRevisionId: block.id },
      revision: {
        id: block.id,
        data: {
          kind: "block",
          type: block.type,
          ...(block.structured ? { structured: block.structured } : {}),
          fields: block.fields.map((field) => ({
            key: field.key,
            contents: field.contents.map((content) => ({
              id: content.id,
              itemId: content.id,
              revisionId: content.id,
            })),
          })),
        },
      },
    },
    ...block.fields.flatMap((field) =>
      field.contents.map((content) => ({
        item: { id: content.id, currentRevisionId: content.id },
        revision: { id: content.id, data: contentValue(content, graph) },
      })),
    ),
  ]);
  return adaptLibraryContent(
    {
      kind: "section",
      type: section.type,
      heading: section.heading,
      blocks: section.blocks.map((block) => ({
        id: block.id,
        itemId: block.id,
        revisionId: block.id,
      })),
    },
    visible,
    section.id,
  );
}
