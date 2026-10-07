import {
  type ContentNode,
  findContent,
  identitySchema,
  layoutPath,
  type ResolvedNode,
  type Resume,
  resolveDocument,
  richTextSchema,
  visualStyleSchema,
} from "@river/domain/workspace";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

export const projectionAttrsSchema = z.object({
  id: z.string().min(1).max(2048),
  layoutId: identitySchema,
  definitionId: identitySchema,
  contentId: z.string(),
  parentContentId: z.string(),
  label: z.string(),
  kind: z.enum(["row", "column", "text"]),
  style: visualStyleSchema,
  spans: richTextSchema,
  placeholder: z.string(),
  bullet: z.boolean(),
  groupRoot: z.boolean(),
  section: z.boolean(),
  selectable: z.boolean(),
  dragId: z.string(),
  dragScope: z.string(),
  horizontal: z.boolean(),
  fieldKey: z.string(),
});
export type ProjectionAttrs = z.infer<typeof projectionAttrsSchema>;
export type EditorSelection = Pick<
  ProjectionAttrs,
  "id" | "layoutId" | "definitionId" | "contentId"
>;
export function contentPath(nodes: ContentNode[], id: string): ContentNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    if (node.kind === "group") {
      const found = contentPath(node.children, id);
      if (found.length) return [node, ...found];
    }
  }
  return [];
}
export function projectDocument(resume: Resume, mode: "template" | "resume"): JSONContent {
  const resolved = resolveDocument(resume, true);
  const project = (view: ResolvedNode, parent?: ResolvedNode): JSONContent => {
    const definition = resume.template.document.definitions.find(
        (item) => item.id === view.definitionId,
      ),
      content = view.contentId ? findContent(resume.sections, view.contentId) : undefined;
    const groupRoot = content?.kind === "group" && definition?.layout.id === view.layoutId;
    const path = content ? contentPath(resume.sections, content.id) : [],
      parentContent = path.at(-2);
    const section = groupRoot && path.length === 1;
    const field = definition?.fields.find((field) => field.key === view.fieldKey);
    const layoutParent = definition
      ? layoutPath(definition.layout, view.layoutId).at(-2)
      : undefined;
    const listItem = content?.kind === "field" && field?.repeat;
    const nestedCopy = parent?.layoutId === view.layoutId;
    const selectable =
      mode === "template"
        ? !nestedCopy
        : !!(groupRoot || content?.kind === "field" || field?.repeat);
    const canDrag =
      mode === "template"
        ? !!layoutParent || section
        : section || (groupRoot && !!parentContent) || listItem;
    const scope = section
      ? "sections"
      : mode === "template"
        ? `layout:${view.definitionId}:${content?.kind === "group" ? content.id : parentContent?.id}:${layoutParent?.id}`
        : `content:${parentContent?.id}:${content?.key}`;
    const attrs: ProjectionAttrs = {
      id: view.id,
      layoutId: view.layoutId,
      definitionId: view.definitionId,
      contentId: view.contentId ?? "",
      parentContentId: parentContent?.id ?? "",
      label: groupRoot
        ? content.label
        : (field?.label ??
          (view.kind === "text" ? "Label" : view.kind === "row" ? "Row" : "Column")),
      kind: view.kind,
      style: view.style,
      spans: view.spans,
      placeholder: view.placeholder ?? "",
      bullet: !!view.bullet,
      groupRoot: !!groupRoot,
      section: !!section,
      selectable,
      dragId:
        canDrag && selectable
          ? section
            ? (content?.id ?? "")
            : mode === "template"
              ? view.layoutId
              : (content?.id ?? "")
          : "",
      dragScope: scope,
      horizontal: mode === "template" ? layoutParent?.kind === "row" : parent?.kind === "row",
      fieldKey: view.fieldKey ?? "",
    };
    return {
      type: view.kind === "text" ? "visualField" : "visualContainer",
      attrs: { view: attrs },
      ...(view.kind === "text"
        ? {}
        : { content: view.children.map((child) => project(child, view)) }),
    };
  };
  return { type: "doc", content: resolved.children.map((node) => project(node)) };
}
export const sameSelection = (a: EditorSelection, b: EditorSelection) => a.id === b.id;
