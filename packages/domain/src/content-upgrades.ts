import { Schema } from "effect";
import { builtInSchemaBundle } from "./content-defaults";
import { builtInSchemaBundleV1 } from "./content-defaults-v1";
import {
  ContentRecord,
  type ContentValues,
  resolveContentSchema,
  type StructuredContent,
  sameSchema,
  validateStructuredContent,
} from "./content-schema";
import { canonicalJson } from "./core";

/** Upgrade a wholly unchanged captured built-in definition set. Values and unknown fields survive. */
export function upgradeBuiltInContent(content: StructuredContent): StructuredContent {
  const unchanged = <T extends { id: string; revision: number }>(
    saved: readonly T[],
    original: readonly T[],
  ) =>
    saved.every((item) =>
      original.some(
        (base) => sameSchema(base, item) && canonicalJson(base) === canonicalJson(item),
      ),
    );
  if (
    !unchanged(content.schemas, builtInSchemaBundleV1.schemas) ||
    !unchanged(content.layouts, builtInSchemaBundleV1.layouts)
  )
    return content;
  const record = (current: ContentRecord): ContentRecord => {
    const values: Record<string, ContentValues[string]> = { ...current.values };
    for (const field of resolveContentSchema(content, current.schema).fields) {
      const value = values[field.id];
      if (value === undefined || value === null) continue;
      if (field.kind === "record")
        values[field.id] = record(Schema.decodeUnknownSync(ContentRecord)(value));
      if (field.kind === "records")
        values[field.id] = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value).map(record);
    }
    return {
      ...current,
      schema: { ...current.schema, revision: 2 },
      layout: { ...current.layout, revision: 2 },
      values,
    };
  };
  const upgraded = {
    ...content,
    schemas: builtInSchemaBundle.schemas.filter((item) =>
      content.schemas.some((saved) => saved.id === item.id),
    ),
    layouts: builtInSchemaBundle.layouts.filter((item) =>
      content.layouts.some((saved) => saved.id === item.id),
    ),
    record: record(content.record),
  };
  validateStructuredContent(upgraded);
  return upgraded;
}
