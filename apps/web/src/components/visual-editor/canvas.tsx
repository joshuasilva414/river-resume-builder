import {
  type FieldValue,
  findContent,
  type Resume,
  type VisualStyle,
} from "@river/domain/workspace";
import { type JSONContent, Node } from "@tiptap/core";
import {
  EditorContent,
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import { GripVertical, Plus, Sparkles } from "lucide-react";
import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RichTextInput } from "~/components/workspace/rich-text";
import { ValueInput } from "~/components/workspace/value-input";
import { type DocumentDragRef, documentStartDrag } from "./drag";
import { type EditorSelection, projectDocument, projectionAttrsSchema } from "./projection";

export type CanvasCommands = {
  mode: "template" | "resume";
  resume: Resume;
  selection: EditorSelection[];
  editing: string | null;
  select: (selection: EditorSelection, additive?: boolean) => void;
  edit: (id: string | null) => void;
  setValue: (id: string, value: FieldValue) => void;
  move: (
    source: EditorSelection,
    target: string,
    position: "before" | "after",
    section: boolean,
  ) => void;
  add: (groupId: string, key: string) => void;
  suggest: (id: string) => void;
  drag: DocumentDragRef;
};
const CanvasContext = createContext<CanvasCommands | null>(null);
export function browserStyle(style: VisualStyle): CSSProperties {
  return {
    fontFamily:
      style.fontFamily === undefined
        ? undefined
        : style.fontFamily === "serif"
          ? '"River Serif",serif'
          : '"River Sans",sans-serif',
    fontSize: style.fontSize === undefined ? undefined : `${style.fontSize}pt`,
    fontWeight: style.weight,
    fontStyle: style.italic ? "italic" : undefined,
    color: style.color,
    textAlign: style.align,
    padding: style.padding === undefined ? undefined : `${style.padding}pt`,
    gap: style.gap === undefined ? undefined : `${style.gap}pt`,
    flexGrow: style.grow ?? 0,
    flexShrink: style.grow === 0 ? 0 : 1,
    flexBasis: "auto",
    width: style.width === undefined ? undefined : `${style.width}pt`,
    borderBottom: style.borderBottom ? "0.5pt solid #d9dde3" : undefined,
    breakInside: style.keepTogether ? "avoid" : undefined,
  };
}
function VisualNode({ node }: NodeViewProps) {
  const context = useContext(CanvasContext);
  if (!context) return null;
  const attrs = projectionAttrsSchema.parse(node.attrs.view);
  const selection: EditorSelection = {
    id: attrs.id,
    layoutId: attrs.layoutId,
    definitionId: attrs.definitionId,
    contentId: attrs.contentId,
  };
  const selected = context.selection.some((item) =>
    context.mode === "template"
      ? item.layoutId === attrs.layoutId && item.definitionId === attrs.definitionId
      : item.id === attrs.id,
  );
  const content = findContent(context.resume.sections, attrs.contentId),
    editing =
      context.mode === "resume" && content?.kind === "field" && context.editing === attrs.contentId;
  const definition = context.resume.template.document.definitions.find(
    (item) => item.id === attrs.definitionId,
  );
  const repeatFields = attrs.groupRoot
    ? (definition?.fields.filter((field) => field.repeat) ?? [])
    : [];
  const choose = (additive = false) => {
    if (attrs.selectable) context.select(selection, additive);
  };
  const startEdit = () => {
    if (content?.kind === "field" && context.mode === "resume") context.edit(attrs.contentId);
  };
  const field = node.type.name === "visualField";
  return (
    <NodeViewWrapper
      className={`visual-node ${attrs.kind === "row" ? "visual-row" : "visual-column"} ${attrs.groupRoot ? "visual-group" : ""} ${attrs.section ? "visual-section" : ""} ${selected && attrs.selectable ? "visual-selected" : ""} ${editing ? "visual-editing" : ""}`}
      style={browserStyle(attrs.style)}
      data-visual-id={attrs.id}
      data-visual-leaf={field ? "true" : undefined}
      data-layout-id={attrs.layoutId}
      data-definition-id={attrs.definitionId}
      data-content-id={attrs.contentId}
      data-selectable={attrs.selectable ? "true" : undefined}
      data-drag-id={attrs.dragId || undefined}
      data-drag-scope={attrs.dragScope}
      data-drag-label={attrs.label}
      contentEditable={field ? false : undefined}
      tabIndex={attrs.selectable ? 0 : -1}
      role={attrs.selectable ? "group" : undefined}
      aria-label={attrs.selectable ? `${attrs.label} block` : undefined}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (!attrs.selectable) return;
        event.stopPropagation();
        choose(event.shiftKey);
      }}
      onDoubleClick={(event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        choose();
        startEdit();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (["Enter", "F2"].includes(event.key)) {
          event.preventDefault();
          choose();
          startEdit();
        }
        if (event.key === "Escape") context.edit(null);
      }}
    >
      {attrs.selectable && (
        <div
          className={`visual-node-tools ${attrs.groupRoot ? "visual-block-tools" : ""}`}
          contentEditable={false}
        >
          {attrs.dragId && (
            <button
              type="button"
              aria-label={`Move ${attrs.label}`}
              onPointerDown={(event) => {
                const source = event.currentTarget.closest<HTMLElement>(".visual-node"),
                  editor = source?.closest(".visual-canvas");
                if (!source || !editor) return;
                documentStartDrag(event, context.drag, {
                  sourceId: attrs.dragId,
                  source,
                  label: attrs.label,
                  hint: "Drop between siblings · Escape to cancel",
                  horizontal: attrs.horizontal,
                  select: () => choose(),
                  targets: () =>
                    [...editor.querySelectorAll<HTMLElement>("[data-drag-id]")]
                      .filter((element) => element.dataset.dragScope === attrs.dragScope)
                      .map((element) => ({
                        id: element.dataset.dragId ?? "",
                        label: element.dataset.dragLabel ?? "Block",
                        element,
                      })),
                  drop: (id, position) => context.move(selection, id, position, attrs.section),
                });
              }}
            >
              <GripVertical size={13} />
            </button>
          )}
          {attrs.groupRoot && (
            <button
              type="button"
              className="visual-group-label"
              onClick={(event) => {
                event.stopPropagation();
                choose();
              }}
            >
              {attrs.section ? "Section" : "Entry"} · {attrs.label}
            </button>
          )}
          {context.mode === "resume" && content && (
            <button
              type="button"
              aria-label={`Suggestions for ${attrs.label}`}
              onClick={(event) => {
                event.stopPropagation();
                choose();
                context.suggest(content.id);
              }}
            >
              <Sparkles size={13} />
            </button>
          )}
          {context.mode === "resume" &&
            repeatFields.map((field) => (
              <button
                type="button"
                key={field.id}
                title={`Add ${field.label}`}
                aria-label={`Add ${field.label} to ${attrs.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.add(attrs.contentId, field.key);
                }}
              >
                <Plus size={14} />
              </button>
            ))}
        </div>
      )}
      {field ? (
        editing && content?.kind === "field" ? (
          <fieldset
            className="visual-inline-editor"
            aria-label="Editing selected field"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                context.edit(null);
              }
            }}
          >
            {content.value.kind === "text" || content.value.kind === "bullet" ? (
              <RichTextInput
                label={attrs.label}
                compact
                autofocus
                value={content.value.value ?? []}
                onChange={(value) =>
                  context.setValue(content.id, {
                    kind: content.value.kind === "bullet" ? "bullet" : "text",
                    value,
                  })
                }
              />
            ) : (
              <ValueInput
                label={attrs.label}
                value={content.value}
                onChange={(value) => context.setValue(content.id, value)}
              />
            )}
          </fieldset>
        ) : (
          <div className={attrs.spans.length ? "visual-prose" : "visual-placeholder"}>
            {attrs.bullet && <span aria-hidden="true">• </span>}
            {attrs.spans.length
              ? attrs.spans.map((span, index) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: Spans have no identity; field identity owns selection and editing.
                    key={index}
                    style={{
                      fontWeight: span.bold ? 700 : undefined,
                      fontStyle: span.italic ? "italic" : undefined,
                      textDecoration: span.href ? "underline" : undefined,
                    }}
                  >
                    {span.text}
                  </span>
                ))
              : attrs.placeholder}
          </div>
        )
      ) : (
        <NodeViewContent
          className={attrs.kind === "row" ? "visual-children-row" : "visual-children-column"}
        />
      )}
      {!field && node.childCount === 0 && (
        <div className="visual-placeholder visual-empty" contentEditable={false}>
          {attrs.fieldKey
            ? `No ${attrs.label.toLowerCase()} yet`
            : `Empty ${attrs.label.toLowerCase()}`}
          {context.mode === "resume" && attrs.fieldKey && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                context.add(attrs.contentId, attrs.fieldKey);
              }}
            >
              <Plus size={14} /> Add
            </button>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
const nodes = [
  Node.create({ name: "doc", topNode: true, content: "visualBlock*" }),
  Node.create({ name: "text", group: "inline" }),
  ...(["visualContainer", "visualField"] as const).map((name) =>
    Node.create({
      name,
      group: "visualBlock",
      content: name === "visualContainer" ? "visualBlock*" : undefined,
      atom: name === "visualField",
      selectable: false,
      draggable: false,
      addAttributes: () => ({ view: { default: null } }),
      parseHTML: () => [{ tag: `div[data-visual-type="${name}"]` }],
      renderHTML: ({ HTMLAttributes }) =>
        name === "visualContainer" ? ["div", HTMLAttributes, 0] : ["div", HTMLAttributes],
      addNodeView: () => ReactNodeViewRenderer(VisualNode),
    }),
  ),
];
/** Update attributes at stable identities during typing. Only structural commands rebuild the projection. */
export function VisualCanvas({ commands }: { commands: CanvasCommands }) {
  const projection = useMemo(
    () => projectDocument(commands.resume, commands.mode),
    [commands.resume, commands.mode],
  );
  const editor = useEditor({
    extensions: nodes,
    editable: false,
    immediatelyRender: false,
    content: projection,
    editorProps: {
      attributes: {
        class: "visual-canvas",
        role: "document",
        "aria-label": "Editable résumé canvas",
      },
    },
  });
  const structure = useRef("");
  useEffect(() => {
    if (!editor) return;
    const signature = (json: JSONContent): string =>
      `${json.type}:${json.attrs?.view?.id ?? ""}[${json.content?.map(signature).join(",") ?? ""}]`;
    const next = signature(projection);
    if (next !== structure.current) {
      editor.commands.setContent(projection, { emitUpdate: false });
      structure.current = next;
      return;
    }
    const views = new Map<string, unknown>();
    const collect = (json: JSONContent) => {
      const view = projectionAttrsSchema.safeParse(json.attrs?.view);
      if (view.success) views.set(view.data.id, view.data);
      for (const child of json.content ?? []) collect(child);
    };
    collect(projection);
    const transaction = editor.state.tr;
    editor.state.doc.descendants((node, position) => {
      const view = projectionAttrsSchema.safeParse(node.attrs.view);
      if (!view.success) return;
      const updated = views.get(view.data.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(view.data))
        transaction.setNodeMarkup(position, undefined, { view: updated });
    });
    if (transaction.docChanged) editor.view.dispatch(transaction);
  }, [editor, projection]);
  const template = commands.resume.template.document;
  const paperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const parent = paperRef.current?.parentElement;
    if (!parent) return;
    const fit = () =>
      setZoom(
        Math.min(
          1,
          Math.max(
            0.4,
            (parent.clientWidth - 72) / (((template.page.size === "A4" ? 595.28 : 612) * 4) / 3),
          ),
        ),
      );
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    fit();
    return () => observer.disconnect();
  }, [template.page.size]);
  return (
    <CanvasContext value={commands}>
      <div
        ref={paperRef}
        className="visual-paper"
        style={{
          ...browserStyle(template.style),
          zoom,
          width: template.page.size === "A4" ? "595.28pt" : "612pt",
          padding: `${template.page.margin}pt`,
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </CanvasContext>
  );
}
