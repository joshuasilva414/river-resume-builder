/** DEMO ONLY: browser-local visual layouts. Production needs a versioned renderer contract, not this model. */
import { builtInSchemaBundle, type ContentRecord, type SchemaReference } from "@river/domain";
import { z } from "zod";

export const demoSchemaIds = [
  "contact-section",
  "contact-link",
  "summary-section",
  "experience-section",
  "experience-entry",
  "education-section",
  "education-entry",
  "skills-section",
] as const;
export type DemoSchemaId = (typeof demoSchemaIds)[number];
export const demoSchemas = builtInSchemaBundle.schemas.filter((schema) =>
  demoSchemaIds.some((id) => id === schema.id),
);
export function demoSchema(id: string) {
  const schema = demoSchemas.find((item) => item.id === id);
  if (!schema) throw new Error("This schema is not included in the demo.");
  return schema;
}
export const demoStyleSchema = z.object({
  gap: z.number().min(0).max(48),
  padding: z.number().min(0).max(48),
  fontSize: z.number().min(10).max(40),
  fontFamily: z.enum(["sans", "serif"]),
  weight: z.enum(["normal", "bold"]),
  align: z.enum(["left", "center", "right"]),
  grow: z.number().min(1).max(8),
});
export type DemoStyle = z.infer<typeof demoStyleSchema>;
export const demoBaseStyle: DemoStyle = {
  gap: 8,
  padding: 0,
  fontSize: 13,
  fontFamily: "sans",
  weight: "normal",
  align: "left",
  grow: 1,
};
type DemoNodeBase = { id: string; style: DemoStyle };
export type DemoLayoutNode = DemoNodeBase &
  (
    | { kind: "row" | "column"; children: DemoLayoutNode[] }
    | { kind: "field" | "repeat"; field: string }
  );
const demoLayoutNodeSchema: z.ZodType<DemoLayoutNode> = z.lazy(() =>
  z.union([
    z.object({
      id: z.string(),
      style: demoStyleSchema,
      kind: z.enum(["row", "column"]),
      children: z.array(demoLayoutNodeSchema),
    }),
    z.object({
      id: z.string(),
      style: demoStyleSchema,
      kind: z.enum(["field", "repeat"]),
      field: z.string(),
    }),
  ]),
);
const demoItemSchema = z.object({ id: z.string(), text: z.string() });
export type DemoTextItem = z.infer<typeof demoItemSchema>;
/** Display strings are intentional: this demo does not write River's typed dates/numbers to production. */
export type DemoRecord = Pick<ContentRecord, "id" | "schema"> & {
  values: Record<string, string | DemoTextItem[]>;
  children: Record<string, DemoRecord[]>;
};
const demoRecordSchema: z.ZodType<DemoRecord> = z.lazy(() =>
  z.object({
    id: z.string(),
    schema: z.object({ id: z.enum(demoSchemaIds), revision: z.number().int().positive() }),
    values: z.record(z.string(), z.union([z.string(), z.array(demoItemSchema)])),
    children: z.record(z.string(), z.array(demoRecordSchema)),
  }),
);
export const demoDefaultSectionOrder = [
  "contact-section",
  "summary-section",
  "experience-section",
  "education-section",
  "skills-section",
];
export const demoStateSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["template", "resume"]),
  job: z.enum(["product", "implementation"]),
  layouts: z.record(z.string(), demoLayoutNodeSchema),
  appliedLayouts: z.record(z.string(), demoLayoutNodeSchema),
  sections: z.array(demoRecordSchema),
  previewCount: z.number().int().min(0).max(3),
  templateSectionOrder: z.array(z.string()).default(demoDefaultSectionOrder),
  appliedSectionOrder: z.array(z.string()).default(demoDefaultSectionOrder),
});
export type DemoState = z.infer<typeof demoStateSchema>;
export type DemoLayouts = DemoState["layouts"];
export type DemoTarget = { recordId: string; field: string; itemId?: string };
export const demoNewId = () => crypto.randomUUID();
export function demoReference(id: string): SchemaReference {
  const schema = demoSchema(id);
  return { id: schema.id, revision: schema.revision };
}
export function demoRecordLabel(record: DemoRecord) {
  const value =
    record.values.name ??
    record.values.employer ??
    record.values.institution ??
    record.values.heading;
  return typeof value === "string" && value.trim() ? value : demoSchema(record.schema.id).name;
}
export function demoFindRecord(records: DemoRecord[], id: string): DemoRecord | undefined {
  for (const record of records) {
    if (record.id === id) return record;
    const child = demoFindRecord(Object.values(record.children).flat(), id);
    if (child) return child;
  }
}
export function demoFindNode(root: DemoLayoutNode, id: string): DemoLayoutNode | undefined {
  if (root.id === id) return root;
  if ("children" in root)
    for (const child of root.children) {
      const match = demoFindNode(child, id);
      if (match) return match;
    }
}
export function demoNodePath(root: DemoLayoutNode, id: string): DemoLayoutNode[] {
  if (root.id === id) return [root];
  if ("children" in root)
    for (const child of root.children) {
      const path = demoNodePath(child, id);
      if (path.length) return [root, ...path];
    }
  return [];
}
export function demoNodeLabel(node: DemoLayoutNode, schemaId: string) {
  return "field" in node
    ? (demoSchema(schemaId).fields.find((field) => field.id === node.field)?.label ?? node.field)
    : node.kind === "row"
      ? "Row"
      : "Column";
}
export function demoPatchNode(
  root: DemoLayoutNode,
  id: string,
  update: (node: DemoLayoutNode) => DemoLayoutNode,
): DemoLayoutNode {
  if (root.id === id) return update(root);
  return "children" in root
    ? { ...root, children: root.children.map((node) => demoPatchNode(node, id, update)) }
    : root;
}
/** All moves remain inside one schema. Reject cycles before detaching so no field can disappear. */
export function demoMoveNode(
  root: DemoLayoutNode,
  sourceId: string,
  targetId: string,
  position: "inside" | "before" | "after",
): DemoLayoutNode {
  const source = demoFindNode(root, sourceId),
    target = demoFindNode(root, targetId);
  if (!source || !target || root.id === sourceId || demoFindNode(source, targetId)) return root;
  if (position === "inside" && !("children" in target)) return root;
  if (position !== "inside" && targetId === root.id) return root;
  const detach = (node: DemoLayoutNode): DemoLayoutNode =>
    "children" in node
      ? { ...node, children: node.children.filter((child) => child.id !== sourceId).map(detach) }
      : node;
  const insert = (node: DemoLayoutNode): DemoLayoutNode => {
    if (!("children" in node)) return node;
    if (node.id === targetId && position === "inside")
      return { ...node, children: [...node.children, source] };
    return {
      ...node,
      children: node.children.flatMap((child) =>
        child.id === targetId && position !== "inside"
          ? position === "before"
            ? [source, child]
            : [child, source]
          : [insert(child)],
      ),
    };
  };
  return insert(detach(root));
}
export function demoUnwrapNode(root: DemoLayoutNode, id: string): DemoLayoutNode {
  if (root.id === id || !("children" in root)) return root;
  return {
    ...root,
    children: root.children.flatMap((child) =>
      child.id === id && "children" in child ? child.children : [demoUnwrapNode(child, id)],
    ),
  };
}
export function demoReadTarget(records: DemoRecord[], target: DemoTarget): string | undefined {
  const value = demoFindRecord(records, target.recordId)?.values[target.field];
  return typeof value === "string" ? value : value?.find((item) => item.id === target.itemId)?.text;
}
export function demoWriteTarget(
  records: DemoRecord[],
  target: DemoTarget,
  text: string,
): DemoRecord[] {
  return records.map((record) => {
    if (record.id === target.recordId) {
      const value = record.values[target.field];
      return {
        ...record,
        values: {
          ...record.values,
          [target.field]: Array.isArray(value)
            ? value.map((item) => (item.id === target.itemId ? { ...item, text } : item))
            : text,
        },
      };
    }
    return {
      ...record,
      children: Object.fromEntries(
        Object.entries(record.children).map(([key, children]) => [
          key,
          demoWriteTarget(children, target, text),
        ]),
      ),
    };
  });
}
export function demoMapRecords(
  records: DemoRecord[],
  id: string,
  update: (record: DemoRecord) => DemoRecord | null,
): DemoRecord[] {
  return records.flatMap((record) => {
    if (record.id === id) {
      const next = update(record);
      return next ? [next] : [];
    }
    return [
      {
        ...record,
        children: Object.fromEntries(
          Object.entries(record.children).map(([key, children]) => [
            key,
            demoMapRecords(children, id, update),
          ]),
        ),
      },
    ];
  });
}
export function demoReorderRecord(
  records: DemoRecord[],
  id: string,
  direction: -1 | 1,
): DemoRecord[] {
  const index = records.findIndex((record) => record.id === id);
  if (index >= 0) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= records.length) return records;
    const result = [...records],
      record = result.splice(index, 1)[0];
    if (record) result.splice(nextIndex, 0, record);
    return result;
  }
  return records.map((record) => ({
    ...record,
    children: Object.fromEntries(
      Object.entries(record.children).map(([key, children]) => [
        key,
        demoReorderRecord(children, id, direction),
      ]),
    ),
  }));
}
export function demoCloneRecord(record: DemoRecord): DemoRecord {
  return {
    ...record,
    id: demoNewId(),
    values: Object.fromEntries(
      Object.entries(record.values).map(([key, value]) => [
        key,
        typeof value === "string" ? value : value.map((item) => ({ ...item, id: demoNewId() })),
      ]),
    ),
    children: Object.fromEntries(
      Object.entries(record.children).map(([key, children]) => [
        key,
        children.map(demoCloneRecord),
      ]),
    ),
  };
}
/** Validate persisted bindings as well as JSON shape; malformed storage must not silently lose content. */
export function demoParseState(value: unknown): DemoState {
  const state = demoStateSchema.parse(value);
  for (const order of [state.templateSectionOrder, state.appliedSectionOrder]) {
    if (
      order.length !== demoDefaultSectionOrder.length ||
      new Set(order).size !== order.length ||
      order.some((id) => !demoDefaultSectionOrder.includes(id))
    )
      throw new Error("Invalid demo section order.");
  }
  for (const layouts of [state.layouts, state.appliedLayouts])
    for (const schema of demoSchemas) {
      const root = layouts[schema.id];
      if (root?.kind !== "column") throw new Error("A demo layout is missing.");
      const ids = new Set<string>(),
        fields: string[] = [];
      const visit = (node: DemoLayoutNode, depth: number) => {
        if (depth > 16 || ids.has(node.id)) throw new Error("Invalid demo layout nesting.");
        ids.add(node.id);
        if ("children" in node)
          node.children.forEach((child) => {
            visit(child, depth + 1);
          });
        else {
          const field = schema.fields.find((item) => item.id === node.field);
          if (
            !field ||
            (node.kind === "repeat") !== (field.kind === "records" || field.kind === "record")
          )
            throw new Error("Invalid demo field binding.");
          fields.push(node.field);
        }
      };
      visit(root, 0);
      if (fields.length !== schema.fields.length || new Set(fields).size !== fields.length)
        throw new Error("The demo schema changed.");
    }
  const recordIds = new Set<string>();
  const inspect = (record: DemoRecord, depth: number) => {
    const schema = demoSchema(record.schema.id);
    if (depth > 8 || recordIds.has(record.id) || schema.revision !== record.schema.revision)
      throw new Error("Invalid demo record.");
    recordIds.add(record.id);
    for (const field of schema.fields) {
      if (field.kind === "records" || field.kind === "record") {
        const children = record.children[field.id];
        if (!children || children.some((child) => child.schema.id !== field.schema.id))
          throw new Error("Invalid demo child record.");
        children.forEach((child) => {
          inspect(child, depth + 1);
        });
      } else {
        const item = record.values[field.id];
        if (field.kind === "list" ? !Array.isArray(item) : typeof item !== "string")
          throw new Error("Invalid demo field value.");
        if (Array.isArray(item))
          for (const entry of item) {
            if (recordIds.has(entry.id)) throw new Error("Duplicate demo item.");
            recordIds.add(entry.id);
          }
      }
    }
  };
  state.sections.forEach((record) => {
    if (demoSchema(record.schema.id).level !== "section") throw new Error("Invalid demo section.");
    inspect(record, 0);
  });
  return state;
}

/** Move whole siblings only. A target in another collection cannot detach the source. */
export function demoMoveRelative<T>(
  items: T[],
  source: T,
  target: T,
  position: "before" | "after",
): T[] {
  if (source === target || !items.includes(source) || !items.includes(target)) return items;
  const next = items.filter((item) => item !== source);
  next.splice(next.indexOf(target) + (position === "after" ? 1 : 0), 0, source);
  return next;
}
export function demoMoveRecordRelative(
  records: DemoRecord[],
  sourceId: string,
  targetId: string,
  position: "before" | "after",
): DemoRecord[] {
  const source = records.find((record) => record.id === sourceId);
  const target = records.find((record) => record.id === targetId);
  if (source) return target ? demoMoveRelative(records, source, target, position) : records;
  return records.map((record) => ({
    ...record,
    children: Object.fromEntries(
      Object.entries(record.children).map(([field, children]) => [
        field,
        demoMoveRecordRelative(children, sourceId, targetId, position),
      ]),
    ),
  }));
}
