import {
  canonicalJson,
  captureSchemaBundle,
  type SchemaBundle,
  type SchemaReference,
  StructuredContent,
  sameSchema,
} from "@river/domain";
import { Schema } from "effect";

export const schemaHistoryKey = "__river_schema_history";

export function savedSchemaSnapshots(content: StructuredContent): readonly StructuredContent[] {
  const decoded = Schema.decodeUnknownOption(Schema.Array(StructuredContent))(
    content.record.values[schemaHistoryKey],
  );
  return decoded._tag === "Some" ? decoded.value : [];
}

function withoutHistory(content: StructuredContent): StructuredContent {
  return {
    ...content,
    record: {
      ...content.record,
      values: Object.fromEntries(
        Object.entries(content.record.values).filter(([key]) => key !== schemaHistoryKey),
      ),
    },
  };
}

/** Capture prior definitions with their values instead of rebinding conflicting saved identities. */
export function switchContentSchema(
  content: StructuredContent,
  bundle: SchemaBundle,
  schema: SchemaReference,
): StructuredContent {
  const selected = captureSchemaBundle(bundle, schema);
  const compatible = selected.layouts.filter((item) => sameSchema(item.schema, schema));
  const first = compatible[0];
  if (!first) throw new Error("Choose a schema with a compatible layout.");
  const identity = (value: StructuredContent) =>
    canonicalJson(captureSchemaBundle(value, value.record.schema));
  const selectedIdentity = canonicalJson(selected);
  if (sameSchema(content.record.schema, schema) && identity(content) === selectedIdentity)
    return content;
  const current = withoutHistory(content);
  const snapshots = savedSchemaSnapshots(content);
  const restored = snapshots.findLast(
    (item) => sameSchema(item.record.schema, schema) && identity(item) === selectedIdentity,
  );
  const layout =
    compatible.find((item) => restored && sameSchema(item, restored.record.layout)) ?? first;
  // One snapshot per captured definition keeps repeated switching bounded and restores the latest edits.
  const history = [
    ...snapshots.filter(
      (item) =>
        !(
          sameSchema(item.record.schema, current.record.schema) &&
          identity(item) === identity(current)
        ),
    ),
    current,
  ];
  return {
    ...content,
    ...selected,
    record: {
      ...content.record,
      schema: { id: schema.id, revision: schema.revision },
      layout: { id: layout.id, revision: layout.revision },
      values: {
        ...current.record.values,
        ...restored?.record.values,
        [schemaHistoryKey]: history,
      },
    },
  };
}
