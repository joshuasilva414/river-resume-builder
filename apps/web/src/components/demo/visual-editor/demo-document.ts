/** DEMO ONLY: projects demo layouts and records to Tiptap. No production document or LaTeX writes. */
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  type DemoLayoutNode,
  type DemoLayouts,
  type DemoRecord,
  demoBaseStyle,
  demoRecordLabel,
  demoSchema,
  demoStyleSchema,
  demoWriteTarget,
} from "./demo-model";

export const demoNodeAttrsSchema = z.object({
  nodeId: z.string(),
  schemaId: z.string(),
  recordId: z.string(),
  field: z.string().default(""),
  itemId: z.string().default(""),
  label: z.string(),
  recordLabel: z.string().default(""),
  kind: z.string(),
  style: demoStyleSchema,
  empty: z.boolean().default(false),
  blankRecord: z.boolean().default(false),
  list: z.boolean().default(false),
});
export type DemoNodeAttrs = z.infer<typeof demoNodeAttrsSchema>;
const demoText = (text: string): JSONContent[] => (text ? [{ type: "text", text }] : []);
export function demoDocument(records: DemoRecord[], layouts: DemoLayouts): JSONContent {
  const renderRecord = (record: DemoRecord, section: boolean): JSONContent => {
    const root = layouts[record.schema.id];
    if (!root) throw new Error("Missing demo layout.");
    const renderNode = (node: DemoLayoutNode): JSONContent => {
      const field =
        "field" in node
          ? demoSchema(record.schema.id).fields.find((item) => item.id === node.field)
          : undefined;
      const value = field ? record.values[field.id] : undefined;
      const attrs: DemoNodeAttrs = {
        nodeId: node.id,
        schemaId: record.schema.id,
        recordId: record.id,
        label: field?.label ?? node.kind,
        recordLabel: "",
        kind: node.kind,
        field: field?.id ?? "",
        itemId: "",
        style: node.style,
        empty: false,
        blankRecord: false,
        list: field?.kind === "list",
      };
      if ("children" in node) {
        const content = node.children.map(renderNode);
        return {
          type: "demoContainer",
          attrs: {
            ...attrs,
            empty: content.length > 0 && content.every((child) => child.attrs?.empty === true),
          },
          content,
        };
      }
      if (node.kind === "repeat") {
        const children = record.children[node.field] ?? [];
        return {
          type: "demoRepeat",
          attrs: { ...attrs, empty: children.length === 0 },
          content: children.map((child) => renderRecord(child, false)),
        };
      }
      if (Array.isArray(value)) {
        return {
          type: "demoList",
          attrs: { ...attrs, empty: value.length === 0 },
          content: value.map((item) => ({
            type: "demoField",
            attrs: { ...attrs, itemId: item.id },
            content: demoText(item.text),
          })),
        };
      }
      return {
        type: "demoField",
        attrs: { ...attrs, empty: !value },
        content: demoText(typeof value === "string" ? value : ""),
      };
    };
    return {
      type: section ? "demoSection" : "demoRecord",
      attrs: {
        nodeId: root.id,
        schemaId: record.schema.id,
        recordId: record.id,
        label: demoSchema(record.schema.id).name,
        recordLabel: demoRecordLabel(record),
        blankRecord:
          Object.values(record.values).every((value) =>
            typeof value === "string" ? !value : value.every((item) => !item.text),
          ) && Object.values(record.children).every((items) => !items.length),
        kind: section ? "section" : "record",
        field: "",
        itemId: "",
        style: demoBaseStyle,
        empty: false,
        list: false,
      },
      content: [renderNode(root)],
    };
  };
  return { type: "doc", content: records.map((record) => renderRecord(record, true)) };
}
/** Read only field values. Pasted/dragged layout attributes can never become a template edit. */
export function demoRecordsFromDocument(doc: JSONContent, records: DemoRecord[]): DemoRecord[] {
  let next = records;
  const visit = (node: JSONContent) => {
    if (node.type === "demoField") {
      const attrs = demoNodeAttrsSchema.parse(node.attrs);
      const text = (node.content ?? []).map((part) => part.text ?? "").join("");
      next = demoWriteTarget(
        next,
        { recordId: attrs.recordId, field: attrs.field, itemId: attrs.itemId || undefined },
        text,
      );
    } else node.content?.forEach(visit);
  };
  visit(doc);
  return next;
}
/** Text edits must preserve field identities/order. Explicit block commands rebuild the projection separately. */
export function demoDocumentStructure(doc: JSONContent): string {
  const shape = (node: JSONContent): unknown =>
    node.type === "demoField"
      ? {
          type: node.type,
          record: node.attrs?.recordId,
          field: node.attrs?.field,
          item: node.attrs?.itemId,
        }
      : { type: node.type, attrs: node.attrs, content: node.content?.map(shape) };
  return JSON.stringify(shape(doc));
}
