import { Schema } from "effect";

const Key = Schema.NonEmptyString.check(Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$/));
export const SchemaReference = Schema.Struct({
  id: Key,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
export type SchemaReference = typeof SchemaReference.Type;
const field = { id: Key, label: Schema.NonEmptyString, required: Schema.Boolean };
const ScalarKind = Schema.Literals(["text", "number", "date", "boolean", "skill"]);
export const ContentSchemaField = Schema.Union([
  Schema.Struct({ ...field, kind: ScalarKind }),
  Schema.Struct({ ...field, kind: Schema.Literal("list"), items: ScalarKind }),
  Schema.Struct({
    ...field,
    kind: Schema.Literals(["record", "records"]),
    schema: SchemaReference,
    defaultLayout: SchemaReference,
  }),
]);
export type ContentSchemaField = typeof ContentSchemaField.Type;
export const ContentSchema = Schema.Struct({
  ...SchemaReference.fields,
  name: Schema.NonEmptyString,
  level: Schema.Literals(["entry", "section"]),
  fields: Schema.Array(ContentSchemaField).check(Schema.isLengthBetween(1, 50)),
});
export type ContentSchema = typeof ContentSchema.Type;
/** Layouts pin a schema independently of the values they render. */
export const ContentLayout = Schema.Struct({
  ...SchemaReference.fields,
  name: Schema.NonEmptyString,
  schema: SchemaReference,
  source: Schema.NonEmptyString.check(Schema.isMaxLength(32768)),
});
export type ContentLayout = typeof ContentLayout.Type;
export const SchemaBundle = Schema.Struct({
  version: Schema.Literal(2),
  schemas: Schema.Array(ContentSchema).check(Schema.isLengthBetween(1, 50)),
  layouts: Schema.Array(ContentLayout).check(Schema.isLengthBetween(1, 100)),
});
export type SchemaBundle = typeof SchemaBundle.Type;
export const ContentValues = Schema.Record(Schema.String, Schema.Json);
export type ContentValues = typeof ContentValues.Type;
export const ContentRecord = Schema.Struct({
  id: Schema.NonEmptyString,
  schema: SchemaReference,
  layout: SchemaReference,
  values: ContentValues,
});
export type ContentRecord = typeof ContentRecord.Type;
export const StructuredContent = Schema.Struct({
  ...SchemaBundle.fields,
  record: ContentRecord,
  evidence: Schema.Array(
    Schema.Struct({ claimId: Schema.NonEmptyString, revisionId: Schema.NonEmptyString }),
  ).check(Schema.isMaxLength(200)),
});
export type StructuredContent = typeof StructuredContent.Type;
export const PartialDate = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("year"),
    year: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 })),
  }),
  Schema.Struct({
    kind: Schema.Literal("month"),
    year: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 })),
    month: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
  }),
  Schema.Struct({
    kind: Schema.Literal("day"),
    value: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  }),
  Schema.Struct({ kind: Schema.Literal("present") }),
  Schema.Struct({ kind: Schema.Literal("legacy"), text: Schema.String }),
]);
export type PartialDate = typeof PartialDate.Type;
export const schemaKey = (reference: SchemaReference) => `${reference.id}@${reference.revision}`;
export const sameSchema = (left: SchemaReference, right: SchemaReference) =>
  schemaKey(left) === schemaKey(right);
export function resolveContentSchema(bundle: SchemaBundle, reference: SchemaReference) {
  const schema = bundle.schemas.find((item) => sameSchema(item, reference));
  if (!schema) throw new Error(`Missing schema: ${schemaKey(reference)}.`);
  return schema;
}
export function resolveContentLayout(bundle: SchemaBundle, reference: SchemaReference) {
  const layout = bundle.layouts.find((item) => sameSchema(item, reference));
  if (!layout) throw new Error(`Missing layout: ${schemaKey(reference)}.`);
  return layout;
}
/** Capture the root's complete reachable definitions and every compatible layout. */
export function captureSchemaBundle(bundle: SchemaBundle, root: SchemaReference): SchemaBundle {
  validateSchemaBundle(bundle);
  const keys = new Set<string>();
  const visit = (reference: SchemaReference) => {
    if (keys.has(schemaKey(reference))) return;
    keys.add(schemaKey(reference));
    for (const field of resolveContentSchema(bundle, reference).fields)
      if (field.kind === "record" || field.kind === "records") visit(field.schema);
  };
  visit(root);
  return {
    version: 2,
    schemas: bundle.schemas.filter((item) => keys.has(schemaKey(item))),
    layouts: bundle.layouts.filter((item) => keys.has(schemaKey(item.schema))),
  };
}
/** Validate the entire captured dependency set, including unused definitions. */
export function validateSchemaBundle(value: unknown): SchemaBundle {
  const bundle = Schema.decodeUnknownSync(SchemaBundle)(value);
  for (const items of [bundle.schemas, bundle.layouts])
    if (new Set(items.map(schemaKey)).size !== items.length)
      throw new Error("Duplicate saved definition.");
  const complete = new Set<string>();
  const visit = (schema: ContentSchema, path: Set<string>) => {
    const key = schemaKey(schema);
    if (path.has(key)) throw new Error("Schema references cannot form a cycle.");
    if (complete.has(key)) return;
    if (new Set(schema.fields.map((item) => item.id)).size !== schema.fields.length)
      throw new Error("Each field needs a unique stable identity.");
    const next = new Set([...path, key]);
    for (const item of schema.fields) {
      if (item.kind !== "record" && item.kind !== "records") continue;
      const child = resolveContentSchema(bundle, item.schema);
      if (!sameSchema(resolveContentLayout(bundle, item.defaultLayout).schema, child))
        throw new Error("Choose a child layout for the referenced schema.");
      visit(child, next);
    }
    complete.add(key);
  };
  for (const schema of bundle.schemas) {
    if (!bundle.layouts.some((layout) => sameSchema(layout.schema, schema)))
      throw new Error(`${schema.name} needs a compatible layout.`);
    visit(schema, new Set());
  }
  for (const layout of bundle.layouts) {
    const schema = resolveContentSchema(bundle, layout.schema);
    const slots = [...layout.source.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_.-]*)\}\}/g)].map(
      (match) => match[1],
    );
    if (
      slots.length !== schema.fields.length ||
      schema.fields.some((item) => slots.filter((id) => id === item.id).length !== 1)
    )
      throw new Error("A layout must render each schema field exactly once.");
  }
  return bundle;
}
function validateScalar(kind: typeof ScalarKind.Type, value: Schema.Json, label: string) {
  if (kind === "date") {
    const date = Schema.decodeUnknownSync(PartialDate)(value);
    if (date.kind === "day") {
      const parsed = new Date(`${date.value}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date.value)
        throw new Error(`${label} needs a valid calendar date.`);
    }
  } else if (
    kind === "number"
      ? typeof value !== "number" || !Number.isFinite(value)
      : kind === "boolean"
        ? typeof value !== "boolean"
        : typeof value !== "string"
  )
    throw new Error(`${label} has the wrong value type.`);
}
/** Unknown fields stay in values when switching schemas; no implicit conversion loses data. */
export function validateContentRecord(
  bundle: SchemaBundle,
  record: ContentRecord,
  depth = 0,
): void {
  if (depth > 20) throw new Error("Content nesting exceeds 20 levels.");
  const schema = resolveContentSchema(bundle, record.schema);
  if (!sameSchema(resolveContentLayout(bundle, record.layout).schema, schema))
    throw new Error("Choose a compatible layout for this content.");
  for (const field of schema.fields) {
    const value = record.values[field.id];
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (field.required) throw new Error(`Complete ${field.label.toLowerCase()}.`);
      continue;
    }
    if (field.kind === "record" || field.kind === "records") {
      const children =
        field.kind === "record"
          ? [value]
          : Schema.decodeUnknownSync(Schema.Array(ContentRecord).check(Schema.isMaxLength(100)))(
              value,
            );
      const ids = new Set<string>();
      for (const childValue of children) {
        const child = Schema.decodeUnknownSync(ContentRecord)(childValue);
        if (!sameSchema(child.schema, field.schema))
          throw new Error(`${field.label} requires ${schemaKey(field.schema)}.`);
        if (ids.has(child.id)) throw new Error("Each entry needs a unique identity.");
        ids.add(child.id);
        validateContentRecord(bundle, child, depth + 1);
      }
    } else if (field.kind === "list") {
      const values = Schema.decodeUnknownSync(
        Schema.Array(Schema.Json).check(Schema.isMaxLength(200)),
      )(value);
      for (const item of values) validateScalar(field.items, item, field.label);
    } else validateScalar(field.kind, value, field.label);
    if (field.id === "gpa" && typeof value === "number" && (value < 0 || value > 10))
      throw new Error("GPA must be between 0 and 10.");
  }
}
export function validateStructuredContent(value: unknown) {
  const content = Schema.decodeUnknownSync(StructuredContent)(value);
  validateSchemaBundle(content);
  validateContentRecord(content, content.record);
  if (new Set(content.evidence.map((ref) => ref.claimId)).size !== content.evidence.length)
    throw new Error("Link each evidence item once.");
  return content;
}
export function nestedContentRecords(content: StructuredContent): readonly ContentRecord[] {
  const records: ContentRecord[] = [];
  const visit = (record: ContentRecord) => {
    for (const field of resolveContentSchema(content, record.schema).fields) {
      const value = record.values[field.id];
      if (
        value === undefined ||
        value === null ||
        (field.kind !== "record" && field.kind !== "records")
      )
        continue;
      const children =
        field.kind === "record"
          ? [Schema.decodeUnknownSync(ContentRecord)(value)]
          : Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value);
      for (const child of children) {
        records.push(child);
        visit(child);
      }
    }
  };
  visit(content.record);
  return records;
}
export function formatPartialDate(value: PartialDate): string {
  switch (value.kind) {
    case "present":
      return "Present";
    case "legacy":
      return value.text;
    case "year":
      return String(value.year);
    case "month":
      return `${String(value.month).padStart(2, "0")}/${value.year}`;
    case "day":
      return value.value;
  }
}
/** Import only unambiguous dates; retain all other historical labels verbatim. */
export function readLegacyDate(text: string): PartialDate {
  if (/^present$/i.test(text.trim())) return { kind: "present" };
  if (/^\d{4}$/.test(text.trim())) return { kind: "year", year: Number(text.trim()) };
  if (/^\d{4}-\d{2}$/.test(text.trim())) {
    const [year, month] = text.trim().split("-").map(Number);
    if (year && month && month <= 12) return { kind: "month", year, month };
  }
  return { kind: "legacy", text };
}
export function scalarText(value: Schema.Json | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return formatPartialDate(Schema.decodeUnknownSync(PartialDate)(value));
}
/** Flatten only for text diagnostics and legacy render adapters, retaining the typed record separately. */
export function contentRecordText(
  bundle: SchemaBundle,
  record: ContentRecord,
  exclude: readonly string[] = [],
): string[] {
  return resolveContentSchema(bundle, record.schema).fields.flatMap((field) => {
    if (exclude.includes(field.id)) return [];
    const value = record.values[field.id];
    if (value === undefined || value === null) return [];
    if (field.kind === "record")
      return contentRecordText(bundle, Schema.decodeUnknownSync(ContentRecord)(value));
    if (field.kind === "records")
      return Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value).flatMap((child) =>
        contentRecordText(bundle, child),
      );
    if (field.kind === "list")
      return Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value)
        .map(scalarText)
        .filter(Boolean);
    return [scalarText(value)].filter(Boolean);
  });
}
