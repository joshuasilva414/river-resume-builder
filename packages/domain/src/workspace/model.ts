import { z } from "zod";

export const workspaceVersion = 1;
export const identitySchema = z.string().min(1).max(160);
const labelSchema = z.string().max(240);
export const safeLinkSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return ["https:", "http:", "mailto:", "tel:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use an http, https, mailto, or tel link.");
export const richSpanSchema = z.object({
  text: z.string().max(20000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: safeLinkSchema.optional(),
});
export const richTextSchema = z.array(richSpanSchema).max(2000);
export type RichText = z.infer<typeof richTextSchema>;
export const dateValueSchema = z
  .discriminatedUnion("precision", [
    z.object({ precision: z.literal("year"), year: z.number().int().min(1).max(9999) }),
    z.object({
      precision: z.literal("month"),
      year: z.number().int().min(1).max(9999),
      month: z.number().int().min(1).max(12),
    }),
    z.object({
      precision: z.literal("day"),
      year: z.number().int().min(1).max(9999),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
    }),
    z.object({ precision: z.literal("present") }),
  ])
  .refine(
    (value) =>
      value.precision !== "day" ||
      value.day <= new Date(Date.UTC(value.year, value.month, 0)).getUTCDate(),
    "This day does not exist in the selected month.",
  );
export type DateValue = z.infer<typeof dateValueSchema>;
export const valueKindSchema = z.enum([
  "text",
  "bullet",
  "skill",
  "date",
  "number",
  "link",
  "boolean",
]);
export type ValueKind = z.infer<typeof valueKindSchema>;
/** Null is an incomplete draft. Zero and false are populated values. */
export const fieldValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: richTextSchema.nullable() }),
  z.object({ kind: z.literal("bullet"), value: richTextSchema.nullable() }),
  z.object({ kind: z.literal("skill"), value: z.string().max(500).nullable() }),
  z.object({ kind: z.literal("date"), value: dateValueSchema.nullable() }),
  z.object({ kind: z.literal("number"), value: z.number().finite().nullable() }),
  z.object({
    kind: z.literal("link"),
    value: z.object({ label: z.string().max(500), href: safeLinkSchema }).nullable(),
  }),
  z.object({ kind: z.literal("boolean"), value: z.boolean().nullable() }),
]);
export type FieldValue = z.infer<typeof fieldValueSchema>;
export const factContextSchema = z.object({
  id: identitySchema,
  label: labelSchema.min(1),
  kind: z.enum(["employment", "project", "education", "profile", "custom"]),
});
export const candidateFactSchema = z.object({
  id: identitySchema,
  label: labelSchema.min(1),
  key: identitySchema,
  contextId: identitySchema.nullable(),
  sourceId: identitySchema.nullable(),
  value: fieldValueSchema,
});
export type FactContext = z.infer<typeof factContextSchema>;
export type CandidateFact = z.infer<typeof candidateFactSchema>;

export const contentFieldSchema = z.object({
  id: identitySchema,
  key: identitySchema,
  label: labelSchema,
  value: fieldValueSchema,
  factIds: z.array(identitySchema).max(100).default([]),
});
export type ContentField = z.infer<typeof contentFieldSchema>;
/** Groups and their children own their values. Origin IDs never imply live bindings. */
export const contentNodeSchema = z.discriminatedUnion("kind", [
  contentFieldSchema.extend({ kind: z.literal("field") }),
  z.object({
    kind: z.literal("group"),
    id: identitySchema,
    key: identitySchema,
    label: labelSchema,
    definitionId: identitySchema.nullable(),
    get children() {
      return z.array(contentNodeSchema).max(1000);
    },
  }),
]);
export type ContentNode = z.infer<typeof contentNodeSchema>;
export type ContentGroup = Extract<ContentNode, { kind: "group" }>;
export type ContentLeaf = Extract<ContentNode, { kind: "field" }>;
export const contentItemSchema = z.object({
  version: z.literal(1),
  name: labelSchema.min(1),
  content: contentNodeSchema,
});
export type ContentItem = z.infer<typeof contentItemSchema>;

export const visualStyleSchema = z.object({
  fontFamily: z.enum(["sans", "serif"]).optional(),
  fontSize: z.number().min(6).max(72).optional(),
  weight: z.enum(["normal", "bold"]).optional(),
  italic: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[\da-fA-F]{6}$/)
    .optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  gap: z.number().min(0).max(72).optional(),
  padding: z.number().min(0).max(72).optional(),
  grow: z.number().min(0).max(20).optional(),
  width: z.number().min(1).max(600).optional(),
  borderBottom: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
});
export type VisualStyle = z.infer<typeof visualStyleSchema>;
const layoutBase = z.object({ id: identitySchema, style: visualStyleSchema.default({}) });
export const layoutNodeSchema = z.discriminatedUnion("kind", [
  layoutBase.extend({ kind: z.literal("field"), fieldKey: identitySchema }),
  layoutBase.extend({
    kind: z.literal("literal"),
    text: z.string().max(2000),
    whenField: identitySchema.optional(),
  }),
  layoutBase.extend({
    kind: z.literal("row"),
    separator: z.string().max(80).optional(),
    get children() {
      return z.array(layoutNodeSchema).max(200);
    },
  }),
  layoutBase.extend({
    kind: z.literal("column"),
    get children() {
      return z.array(layoutNodeSchema).max(200);
    },
  }),
]);
export type LayoutNode = z.infer<typeof layoutNodeSchema>;
export const templateFieldSchema = z.object({
  id: identitySchema,
  key: identitySchema,
  label: labelSchema.min(1),
  type: z.union([valueKindSchema, z.literal("group")]),
  repeat: z.boolean().default(false),
  definitionId: identitySchema.optional(),
  required: z.boolean().default(false),
  prefix: z.string().max(200).default(""),
  suffix: z.string().max(200).default(""),
  separator: z.string().max(80).default(""),
  dateFormat: z.enum(["short", "long", "numeric"]).default("short"),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;
export const entryDefinitionSchema = z.object({
  id: identitySchema,
  label: labelSchema.min(1),
  fields: z.array(templateFieldSchema).max(100),
  layout: layoutNodeSchema,
});
export type EntryDefinition = z.infer<typeof entryDefinitionSchema>;
export const templateSectionSchema = z.object({
  id: identitySchema,
  key: identitySchema,
  label: labelSchema.min(1),
  definitionId: identitySchema,
});
export const visualTemplateSchema = z.object({
  version: z.literal(1),
  name: labelSchema.min(1),
  page: z.object({ size: z.enum(["LETTER", "A4"]), margin: z.number().min(12).max(100) }),
  style: visualStyleSchema,
  definitions: z.array(entryDefinitionSchema).min(1).max(100),
  sections: z.array(templateSectionSchema).max(50),
});
export type VisualTemplate = z.infer<typeof visualTemplateSchema>;
export const capturedTemplateSchema = z.object({
  id: identitySchema,
  revision: z.number().int().nonnegative(),
  document: visualTemplateSchema,
});
export const resumeSchema = z.object({
  version: z.literal(1),
  name: labelSchema.min(1),
  template: capturedTemplateSchema,
  job: z
    .object({ id: identitySchema, title: labelSchema, description: z.string().max(40000) })
    .nullable(),
  sections: z.array(contentNodeSchema).max(100),
  unused: z.array(contentNodeSchema).max(1000).default([]),
});
export type Resume = z.infer<typeof resumeSchema>;
export const newIdentity = () => crypto.randomUUID();
export function blankValue(kind: ValueKind): FieldValue {
  return fieldValueSchema.parse({ kind, value: null });
}
export function populated(value: FieldValue): boolean {
  if (value.value === null) return false;
  if (value.kind === "text" || value.kind === "bullet")
    return value.value.some((span) => span.text.trim());
  if (value.kind === "skill") return value.value.trim().length > 0;
  return true;
}
export const plainRichText = (text: string): RichText => (text ? [{ text }] : []);
