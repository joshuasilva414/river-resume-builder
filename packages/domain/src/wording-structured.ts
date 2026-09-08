import { Schema } from "effect";
import type { Composition } from "./composition";
import {
  ContentRecord,
  ContentSchemaField,
  resolveContentSchema,
  SchemaReference,
  type StructuredContent,
} from "./content-schema";
import { ApplicationError, ContentType } from "./core";
import { RecordId } from "./evidence";
import { EvidenceReference, LibraryReference } from "./library";

/** Record identities survive entry reordering; scalar list positions also capture their length. */
export const StructuredWordingPath = Schema.Struct({
  kind: Schema.Literal("structured-field"),
  sectionId: RecordId,
  blockId: Schema.NullOr(RecordId),
  records: Schema.Array(
    Schema.Struct({ fieldId: Schema.NonEmptyString, recordId: Schema.NonEmptyString }),
  ).check(Schema.isMaxLength(50)),
  fieldId: Schema.NonEmptyString,
  index: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 199 }))),
});
export type StructuredWordingPath = typeof StructuredWordingPath.Type;
export const StructuredWordingTarget = Schema.Struct({
  scope: Schema.Literal("structured-field-v1"),
  path: StructuredWordingPath,
  sectionType: ContentType,
  field: Schema.NonEmptyString,
  definition: ContentSchemaField,
  recordSchema: SchemaReference,
  recordId: Schema.NonEmptyString,
  containerReference: LibraryReference,
  listLength: Schema.NullOr(Schema.Int),
  content: Schema.Struct({
    wording: Schema.String,
    evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(200)),
  }),
});
export type StructuredWordingTarget = typeof StructuredWordingTarget.Type;

function missing(): never {
  throw new ApplicationError({
    code: "Conflict",
    message: "The target wording field is no longer present or has changed type.",
  });
}
function container(data: Composition, path: StructuredWordingPath) {
  const section = data.sections.find((item) => item.id === path.sectionId);
  if (!section) return missing();
  if (path.blockId === null) {
    if (!section.structured) return missing();
    return { content: section.structured, reference: section.reference, sectionType: section.type };
  }
  const block = section.blocks.find((item) => item.id === path.blockId);
  if (!block?.structured) return missing();
  return { content: block.structured, reference: block.reference, sectionType: section.type };
}
function children(
  content: StructuredContent,
  record: ContentRecord,
  fieldId: string,
): readonly ContentRecord[] {
  const field = resolveContentSchema(content, record.schema).fields.find(
    (item) => item.id === fieldId,
  );
  const value = record.values[fieldId];
  if (!field || value === undefined || value === null) return missing();
  if (field.kind === "record") return [Schema.decodeUnknownSync(ContentRecord)(value)];
  if (field.kind === "records") return Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value);
  return missing();
}
function targetRecord(content: StructuredContent, path: StructuredWordingPath) {
  let record = content.record;
  for (const step of path.records) {
    const found = children(content, record, step.fieldId).filter(
      (item) => item.id === step.recordId,
    );
    if (found.length !== 1 || !found[0]) return missing();
    record = found[0];
  }
  return record;
}
export function captureStructuredWordingTarget(
  data: Composition,
  path: StructuredWordingPath,
): StructuredWordingTarget {
  const value = container(data, path),
    record = targetRecord(value.content, path);
  const definition = resolveContentSchema(value.content, record.schema).fields.find(
    (item) => item.id === path.fieldId,
  );
  const raw = record.values[path.fieldId];
  if (!definition || definition.id === "heading") return missing();
  let wording: string,
    listLength: number | null = null;
  if (definition.kind === "text" && path.index === null && typeof raw === "string") wording = raw;
  else if (
    definition.kind === "list" &&
    definition.items === "text" &&
    path.index !== null &&
    Array.isArray(raw)
  ) {
    const text = raw[path.index];
    if (typeof text !== "string") return missing();
    wording = text;
    listLength = raw.length;
  } else return missing();
  return {
    scope: "structured-field-v1",
    path,
    sectionType: value.sectionType,
    field: `${definition.label}${path.index === null ? "" : ` ${path.index + 1}`}`,
    definition,
    recordSchema: record.schema,
    recordId: record.id,
    containerReference: value.reference,
    listLength,
    content: { wording, evidence: value.content.evidence },
  };
}

/** Replace one real schema value. Other values, nested records, layouts, and reusable content stay intact. */
export function replaceStructuredWording(
  data: Composition,
  path: StructuredWordingPath,
  wording: string,
  evidence?: readonly EvidenceReference[],
): Composition {
  captureStructuredWordingTarget(data, path);
  const current = container(data, path).content;
  const update = (record: ContentRecord, depth: number): ContentRecord => {
    const step = path.records[depth];
    if (!step) {
      const raw = record.values[path.fieldId];
      const value =
        path.index === null
          ? wording
          : Array.isArray(raw)
            ? raw.map((item, index) => (index === path.index ? wording : item))
            : missing();
      return { ...record, values: { ...record.values, [path.fieldId]: value } };
    }
    const definition = resolveContentSchema(current, record.schema).fields.find(
      (item) => item.id === step.fieldId,
    );
    const next = children(current, record, step.fieldId).map((child) =>
      child.id === step.recordId ? update(child, depth + 1) : child,
    );
    const value = definition?.kind === "record" ? next[0] : next;
    if (value === undefined) return missing();
    return { ...record, values: { ...record.values, [step.fieldId]: value } };
  };
  const structured = {
    ...current,
    record: update(current.record, 0),
    evidence: evidence ?? current.evidence,
  };
  return {
    ...data,
    sections: data.sections.map((section) =>
      section.id !== path.sectionId
        ? section
        : path.blockId === null
          ? { ...section, structured, reason: section.reason ?? "Edited wording" }
          : {
              ...section,
              blocks: section.blocks.map((block) =>
                block.id === path.blockId
                  ? { ...block, structured, reason: block.reason ?? "Edited wording" }
                  : block,
              ),
            },
    ),
  };
}

/** Enumerate editable text without projecting structured records into legacy placements. */
export function structuredWordingPaths(
  content: StructuredContent,
  sectionId: string,
  blockId: string | null = null,
) {
  const result: { path: StructuredWordingPath; label: string; wording: string }[] = [];
  const visit = (
    record: ContentRecord,
    records: StructuredWordingPath["records"],
    labels: readonly string[],
  ) => {
    for (const field of resolveContentSchema(content, record.schema).fields) {
      const value = record.values[field.id];
      const path = {
        kind: "structured-field" as const,
        sectionId,
        blockId,
        records,
        fieldId: field.id,
        index: null,
      };
      if (
        field.kind === "text" &&
        field.id !== "heading" &&
        typeof value === "string" &&
        value.trim()
      )
        result.push({ path, label: [...labels, field.label].join(" / "), wording: value });
      if (field.kind === "list" && field.items === "text" && Array.isArray(value))
        value.forEach((item, index) => {
          if (typeof item === "string" && item.trim())
            result.push({
              path: { ...path, index },
              label: [...labels, `${field.label} ${index + 1}`].join(" / "),
              wording: item,
            });
        });
      if (
        (field.kind === "record" || field.kind === "records") &&
        value !== undefined &&
        value !== null
      )
        children(content, record, field.id).forEach((child, index) => {
          visit(
            child,
            [...records, { fieldId: field.id, recordId: child.id }],
            [...labels, `${field.label} ${index + 1}`],
          );
        });
    }
  };
  visit(content.record, [], []);
  return result;
}
