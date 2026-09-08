import {
  type ContentRecord,
  type ContentSchemaField,
  captureSchemaBundle,
  contentRecordText,
  type ResumeDocument,
  resolveContentSchema,
  type SchemaBundle,
  sameSchema,
} from "@river/domain";
import type { Schema } from "effect";
import { templateFixtures } from "./fixtures";
import { type TemplateGraph, validateGraph } from "./graph";

/** Schema previews contain only generated fictional values, including custom fields. */
export function schemaSampleDocument(graph: TemplateGraph): ResumeDocument {
  return sampleDocument(graph, false);
}

/** Exercise each named layout once as a root, including layouts normally used by child records. */
export function schemaValidationDocument(graph: TemplateGraph): ResumeDocument {
  return sampleDocument(graph, true);
}

function sampleDocument(graph: TemplateGraph, allLayouts: boolean): ResumeDocument {
  const bundle = validateGraph(graph).composition;
  if (!bundle) return templateFixtures[0].document;
  let records = 0;
  let values = 0;
  const scalar = (kind: string, label: string): Schema.Json =>
    kind === "number"
      ? 3.8
      : kind === "boolean"
        ? true
        : kind === "date"
          ? { kind: "year", year: 2026 }
          : label === "Summary text"
            ? "Built accessible web tools and reliable data workflows."
            : `Example ${label.toLowerCase()}`;
  const build = (
    bundle: SchemaBundle,
    reference: ContentRecord["schema"],
    layout: ContentRecord["layout"],
    id: string,
    depth = 0,
  ): ContentRecord => {
    // A small acyclic schema DAG can still expand exponentially into concrete records.
    if (++records > 1000 || depth > 20)
      throw new Error("The synthetic sample exceeds its record or nesting limit.");
    const schema = resolveContentSchema(bundle, reference);
    const fieldValue = (field: ContentSchemaField): Schema.Json => {
      if (++values > 10000) throw new Error("The synthetic sample exceeds its field limit.");
      if (field.kind === "record" || field.kind === "records") {
        const child = build(
          bundle,
          field.schema,
          field.defaultLayout,
          `${id}.${field.id}`,
          depth + 1,
        );
        return field.kind === "record" ? child : [child];
      }
      if (field.id === "heading" && field.kind === "text") return schema.name;
      if (field.kind === "list") return [scalar(field.items, field.label)];
      return scalar(field.kind, field.label);
    };
    return {
      id,
      schema: reference,
      layout,
      values: Object.fromEntries(schema.fields.map((field) => [field.id, fieldValue(field)])),
    };
  };
  const contactSchema = bundle.schemas.find((schema) => schema.id === "contact-section");
  const contactLayout = bundle.layouts.find(
    (layout) =>
      contactSchema &&
      layout.schema.id === contactSchema.id &&
      layout.schema.revision === contactSchema.revision,
  );
  const contactRecord =
    contactSchema && contactLayout
      ? build(bundle, contactSchema, contactLayout, "sample.contact")
      : undefined;
  const nameField = contactSchema?.fields.find((field) => field.id === "name");
  const namedContact =
    contactRecord && nameField?.kind === "text"
      ? { ...contactRecord, values: { ...contactRecord.values, name: "Alex Example" } }
      : contactRecord;
  const structuredContact = namedContact
    ? {
        ...captureSchemaBundle(bundle, namedContact.schema),
        record: namedContact,
        evidence: [],
      }
    : undefined;
  const contactText = structuredContact
    ? contentRecordText(bundle, structuredContact.record)
    : ["Alex Example", "alex@example.com", "Example City"];
  const layouts = allLayouts
    ? bundle.layouts.filter((layout) => !contactLayout || !sameSchema(layout, contactLayout))
    : bundle.schemas
        .filter((schema) => schema.id !== "contact-section")
        .map((schema) => {
          const layout = bundle.layouts.find((layout) => sameSchema(layout.schema, schema));
          if (!layout) throw new Error("A sample schema has no compatible layout.");
          return layout;
        });
  const document: ResumeDocument = {
    ...(structuredContact ? { structuredContact } : {}),
    name: contactText[0] ?? "Alex Example",
    contact: contactText.slice(1),
    sections: layouts.map((layout) => {
      const schema = resolveContentSchema(bundle, layout.schema);
      const record = build(bundle, schema, layout, `sample.${layout.id}.${layout.revision}`);
      const structured = { ...captureSchemaBundle(bundle, schema), record, evidence: [] };
      const heading =
        contentRecordText(
          bundle,
          record,
          schema.fields.filter((field) => field.id !== "heading").map((field) => field.id),
        ).join(" ") || schema.name;
      return {
        type: "summary",
        heading,
        structured,
        blocks: [
          {
            heading: "",
            detail: "",
            paragraphs: contentRecordText(bundle, record, ["heading"]),
            bullets: [],
          },
        ],
      };
    }),
  };
  if (JSON.stringify(document).length > 2_000_000)
    throw new Error("The synthetic sample exceeds its document size limit.");
  return document;
}
