import { z } from "zod";
import {
  candidateFactSchema,
  type FieldValue,
  factContextSchema,
  fieldValueSchema,
  newIdentity,
  plainRichText,
  safeLinkSchema,
  valueKindSchema,
} from "./model";

export const extractedSourceSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  filename: z.string().min(1).max(200),
  mime: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ]),
  text: z.string().max(500000),
  parser: z.string().min(1).max(80),
  parserVersion: z.string().min(1).max(80),
  originalBase64: z.string().max(13981016).optional(),
  provenanceUrl: safeLinkSchema.nullable(),
  note: z.string().max(4000),
});
export type ExtractedSource = z.infer<typeof extractedSourceSchema>;
export const factImportWireSchema = z.object({
  contexts: z
    .array(z.object({ key: z.string(), label: z.string(), kind: factContextSchema.shape.kind }))
    .max(100),
  facts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        contextKey: z.string().nullable(),
        type: valueKindSchema,
        value: z.string(),
      }),
    )
    .max(500),
});
export const factImportPreviewSchema = z.object({
  contexts: z.array(factContextSchema),
  facts: z.array(candidateFactSchema),
});
export function typedValueFromText(
  kind: z.infer<typeof valueKindSchema>,
  text: string,
): FieldValue {
  if (kind === "text" || kind === "bullet") return { kind, value: plainRichText(text) };
  if (kind === "skill") return { kind, value: text };
  if (kind === "number")
    return fieldValueSchema.parse({ kind, value: text.trim() ? Number(text) : null });
  if (kind === "boolean") {
    if (!["true", "false", ""].includes(text)) throw Error("Boolean values must be true or false.");
    return { kind, value: text ? text === "true" : null };
  }
  if (kind === "link")
    return fieldValueSchema.parse({ kind, value: text ? { href: text, label: text } : null });
  const parts = text.split("-").map(Number);
  return fieldValueSchema.parse({
    kind,
    value: !text
      ? null
      : text.toLowerCase() === "present"
        ? { precision: "present" }
        : parts.length === 1
          ? { precision: "year", year: parts[0] }
          : parts.length === 2
            ? { precision: "month", year: parts[0], month: parts[1] }
            : { precision: "day", year: parts[0], month: parts[1], day: parts[2] },
  });
}
export function resolveImportPreview(
  wire: z.infer<typeof factImportWireSchema>,
  sourceId: string | null,
) {
  const contexts = wire.contexts.map((context) => ({
    id: newIdentity(),
    label: context.label,
    kind: context.kind,
  }));
  const ids = new Map(wire.contexts.map((context, index) => [context.key, contexts[index]?.id]));
  if (ids.size !== contexts.length) throw Error("The import returned duplicate context keys.");
  const facts = wire.facts.map((fact) => {
    if (fact.contextKey && !ids.get(fact.contextKey))
      throw Error("The import returned an unknown context.");
    return {
      id: newIdentity(),
      key: fact.key,
      label: fact.label,
      contextId: fact.contextKey ? (ids.get(fact.contextKey) ?? null) : null,
      sourceId,
      value: typedValueFromText(fact.type, fact.value),
    };
  });
  return factImportPreviewSchema.parse({ contexts, facts });
}
