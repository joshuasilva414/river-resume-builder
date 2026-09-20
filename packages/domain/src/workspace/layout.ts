import {
  type EntryDefinition,
  type LayoutNode,
  newIdentity,
  type TemplateField,
  type VisualTemplate,
} from "./model";

export function layoutPath(root: LayoutNode, id: string): LayoutNode[] {
  if (root.id === id) return [root];
  if (root.kind === "row" || root.kind === "column")
    for (const child of root.children) {
      const path = layoutPath(child, id);
      if (path.length) return [root, ...path];
    }
  return [];
}
export function changeLayout(
  root: LayoutNode,
  id: string,
  update: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  if (root.id === id) return update(root);
  return root.kind === "row" || root.kind === "column"
    ? { ...root, children: root.children.map((child) => changeLayout(child, id, update)) }
    : root;
}
/** Unwrap containers; field bindings survive removing a row or column. */
export function removeLayout(root: LayoutNode, id: string): LayoutNode {
  if (root.kind !== "row" && root.kind !== "column") return root;
  return {
    ...root,
    children: root.children.flatMap((child) =>
      child.id === id
        ? child.kind === "row" || child.kind === "column"
          ? child.children
          : []
        : [removeLayout(child, id)],
    ),
  };
}
export function moveLayout(
  root: LayoutNode,
  id: string,
  targetId: string,
  placement: "before" | "after" | "inside",
): LayoutNode {
  const path = layoutPath(root, id),
    targetPath = layoutPath(root, targetId),
    source = path.at(-1),
    target = targetPath.at(-1);
  if (!source || !target || path.length < 2 || layoutPath(source, targetId).length) return root;
  if (placement === "inside" && target.kind !== "row" && target.kind !== "column") return root;
  if (placement !== "inside" && path.at(-2)?.id !== targetPath.at(-2)?.id) return root;
  const take = (node: LayoutNode): LayoutNode =>
    node.kind === "row" || node.kind === "column"
      ? { ...node, children: node.children.filter((child) => child.id !== id).map(take) }
      : node;
  const without = take(root);
  if (placement === "inside")
    return changeLayout(without, targetId, (node) =>
      node.kind === "row" || node.kind === "column"
        ? { ...node, children: [...node.children, source] }
        : node,
    );
  const parentId = targetPath.at(-2)?.id;
  return parentId
    ? changeLayout(without, parentId, (node) => {
        if (node.kind !== "row" && node.kind !== "column") return node;
        const children = [...node.children],
          index = children.findIndex((child) => child.id === targetId);
        children.splice(index + Number(placement === "after"), 0, source);
        return { ...node, children };
      })
    : root;
}
export function addLayout(
  definition: EntryDefinition,
  parentId: string,
  kind: "row" | "column" | "literal",
  text = "Label",
): EntryDefinition {
  const child: LayoutNode =
    kind === "literal"
      ? { id: newIdentity(), kind, text, style: {} }
      : { id: newIdentity(), kind, style: { gap: 6 }, children: [] };
  return {
    ...definition,
    layout: changeLayout(definition.layout, parentId, (node) =>
      node.kind === "row" || node.kind === "column"
        ? { ...node, children: [...node.children, child] }
        : node,
    ),
  };
}
export function addTemplateField(
  definition: EntryDefinition,
  field: TemplateField,
  parentId = definition.layout.id,
): EntryDefinition {
  return {
    ...definition,
    fields: [...definition.fields, field],
    layout: changeLayout(definition.layout, parentId, (node) =>
      node.kind === "row" || node.kind === "column"
        ? {
            ...node,
            children: [
              ...node.children,
              { id: newIdentity(), kind: "field", fieldKey: field.key, style: {} },
            ],
          }
        : node,
    ),
  };
}
export const changeDefinition = (
  template: VisualTemplate,
  id: string,
  update: (definition: EntryDefinition) => EntryDefinition,
): VisualTemplate => ({
  ...template,
  definitions: template.definitions.map((definition) =>
    definition.id === id ? update(definition) : definition,
  ),
});
export function emptyDefinition(label: string): EntryDefinition {
  return {
    id: newIdentity(),
    label,
    fields: [],
    layout: { id: newIdentity(), kind: "column", style: { gap: 6 }, children: [] },
  };
}
