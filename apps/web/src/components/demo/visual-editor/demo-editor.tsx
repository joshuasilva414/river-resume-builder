/** DEMO ONLY: constrained Tiptap projection and controls. Production needs real persistence and renderer integration. */
import { Extension, type JSONContent, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
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
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  demoCanEditDocument,
  demoDocument,
  demoNodeAttrsSchema,
  demoRecordsFromDocument,
} from "./demo-document";
import { type DemoDragRef, type DemoDropPosition, demoStartDrag } from "./demo-drag";
import {
  type DemoLayouts,
  type DemoRecord,
  type DemoTarget,
  demoNodePath,
  demoSchema,
} from "./demo-model";

export type DemoSelection = {
  schemaId: string;
  nodeId: string;
  recordId: string;
  field?: string;
  itemId?: string;
};
type DemoEditorContextValue = {
  mode: "template" | "resume";
  selection: DemoSelection | null;
  select: (selection: DemoSelection) => void;
  suggest: (target: DemoTarget) => void;
  move: (schemaId: string, from: string, to: string, position: DemoDropPosition) => void;
  addEntry: (parentId: string, field: string) => DemoTarget | null;
  moveListItem: (source: DemoTarget, targetId: string, position: DemoDropPosition) => void;
  moveRecord: (from: string, to: string, position: DemoDropPosition) => void;
  layouts: DemoLayouts;
  deleteContainer: () => void;
  multiSelection: DemoSelection[];
  toggleSelection: (selection: DemoSelection) => void;
  drag: DemoDragRef;
};
type DemoNodeViewContext = DemoEditorContextValue & {
  editing: DemoTarget | null;
  edit: (target: DemoTarget, coordinates?: { left: number; top: number }) => void;
};
const DemoEditorContext = createContext<DemoNodeViewContext | null>(null);
function DemoNodeView({ node }: NodeViewProps) {
  const context = useContext(DemoEditorContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!context) return null;
  const attrs = demoNodeAttrsSchema.parse(node.attrs);
  const field = node.type.name === "demoField";
  const section = node.type.name === "demoSection";
  const record = section || node.type.name === "demoRecord";
  const list = node.type.name === "demoList";
  const editing =
    field &&
    context.mode === "resume" &&
    context.editing?.recordId === attrs.recordId &&
    context.editing.field === attrs.field &&
    (context.editing.itemId ?? "") === attrs.itemId;
  const empty = field ? !node.textContent : attrs.empty;
  const showPlaceholders =
    record &&
    !section &&
    context.mode === "resume" &&
    (attrs.blankRecord || context.selection?.recordId === attrs.recordId);
  const entryFields = section
    ? demoSchema(attrs.schemaId).fields.flatMap((field) =>
        field.kind === "records" ? [{ id: field.id, schemaId: field.schema.id }] : [],
      )
    : [];
  const rootContainer =
    node.type.name === "demoContainer" && attrs.nodeId === `${attrs.schemaId}-root`;
  const listItem = field && attrs.list;
  const selectable = !rootContainer && !(context.mode === "template" && listItem);
  const matches = (item: DemoSelection) =>
    item.nodeId === attrs.nodeId &&
    item.recordId === attrs.recordId &&
    (item.itemId ?? "") === attrs.itemId;
  const selected =
    selectable &&
    (context.multiSelection.length
      ? context.multiSelection.some(matches)
      : !!context.selection && matches(context.selection));
  const selection: DemoSelection = {
    schemaId: attrs.schemaId,
    nodeId: attrs.nodeId,
    recordId: attrs.recordId,
    field: attrs.field || undefined,
    itemId: context.mode === "template" ? undefined : attrs.itemId || undefined,
  };
  const root = context.layouts[attrs.schemaId];
  const parent = root ? demoNodePath(root, attrs.nodeId).at(-2) : undefined;
  const dragKind = section
    ? "section"
    : record
      ? "entry"
      : listItem && context.mode === "resume"
        ? "list-item"
        : parent && !listItem
          ? "layout"
          : undefined;
  const canDrag =
    !!dragKind &&
    (record
      ? section || context.mode === "resume"
      : listItem
        ? context.mode === "resume"
        : context.mode === "template");
  const label = record
    ? `${attrs.recordLabel || attrs.label} ${section ? "section" : "entry"}`
    : `${attrs.label} ${listItem ? "item" : list ? "list" : node.type.name === "demoContainer" ? "container" : "field"}`;
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    const source = event.currentTarget.closest<HTMLElement>(".demo-node");
    const editor = source?.closest(".demo-editor");
    if (!source || !editor) return;
    demoStartDrag(event, context.drag, {
      sourceId: record ? attrs.recordId : listItem ? attrs.itemId : attrs.nodeId,
      source,
      label,
      hint:
        record || listItem
          ? "Drop between matching blocks · Esc to cancel"
          : "Drop between siblings · Use Move into to change containers",
      horizontal: listItem ? attrs.field === "skills" : !record && parent?.kind === "row",
      select: () => context.select(selection),
      targets: () =>
        [...editor.querySelectorAll<HTMLElement>(`[data-demo-drag-kind="${dragKind}"]`)]
          .filter(
            (element) =>
              section ||
              (record
                ? element.parentElement?.parentElement === source.parentElement?.parentElement
                : element.dataset.demoRecord === attrs.recordId &&
                  (listItem
                    ? element.dataset.demoField === attrs.field
                    : element.dataset.demoDragParent === parent?.id)),
          )
          .map((element) => ({
            id: element.dataset.demoDragId ?? "",
            label: element.dataset.demoDragLabel ?? "block",
            element,
          })),
      drop: (id, position) =>
        record
          ? context.moveRecord(attrs.recordId, id, position)
          : listItem
            ? context.moveListItem(
                { recordId: attrs.recordId, field: attrs.field, itemId: attrs.itemId },
                id,
                position,
              )
            : context.move(attrs.schemaId, attrs.nodeId, id, position),
    });
  };
  const target: DemoTarget = {
    recordId: attrs.recordId,
    field: attrs.field,
    itemId: attrs.itemId || undefined,
  };
  const style: CSSProperties & { "--demo-gap": string } = {
    fontSize: attrs.style.fontSize,
    fontFamily:
      attrs.style.fontFamily === "serif"
        ? '"Newsreader Variable", Georgia, serif'
        : '"Instrument Sans Variable", sans-serif',
    fontWeight: attrs.style.weight === "bold" ? 600 : 400,
    textAlign: attrs.style.align,
    padding: attrs.style.padding,
    paddingBottom: attrs.field === "heading" ? attrs.style.padding + 5 : attrs.style.padding,
    paddingLeft:
      attrs.list && field && attrs.field !== "skills"
        ? attrs.style.padding + 14
        : attrs.style.padding,
    minWidth: 0,
    "--demo-gap": `${attrs.style.gap}px`,
  };
  const choose = () => context.select(selection);
  const startSuggestions = () => {
    choose();
    context.suggest(target);
  };
  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <NodeViewWrapper
      className={`demo-node demo-${node.type.name} ${attrs.kind === "row" ? "demo-row" : "demo-column"} ${selected ? "demo-selected" : ""} ${editing ? "demo-editing" : ""} ${empty && !selected ? "demo-empty" : ""} ${showPlaceholders ? "demo-show-placeholders" : ""} ${attrs.field === "heading" ? "demo-section-heading" : ""} ${attrs.field === "skills" ? "demo-skills" : ""} ${attrs.list && field ? "demo-list-item" : ""}`}
      style={style}
      contentEditable={field && !editing ? false : undefined}
      tabIndex={field && context.mode === "resume" ? (editing ? -1 : 0) : undefined}
      role={field && context.mode === "resume" ? "textbox" : undefined}
      aria-label={field && context.mode === "resume" ? attrs.label : undefined}
      aria-readonly={field && context.mode === "resume" ? !editing : undefined}
      title={
        field && context.mode === "resume" && !editing
          ? "Double-click or press Enter to edit"
          : undefined
      }
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (
          field &&
          context.mode === "resume" &&
          !editing &&
          !(event.target instanceof Element && event.target.closest("button"))
        )
          event.preventDefault();
      }}
      onDoubleClick={(event: MouseEvent<HTMLDivElement>) => {
        if (
          !field ||
          context.mode !== "resume" ||
          (event.target instanceof Element && event.target.closest("button"))
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        choose();
        context.edit(target, { left: event.clientX, top: event.clientY });
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (
          event.target === event.currentTarget &&
          field &&
          context.mode === "resume" &&
          !editing &&
          (event.key === "Enter" || event.key === "F2")
        ) {
          event.preventDefault();
          event.stopPropagation();
          context.edit(target);
        }
      }}
      data-demo-node={attrs.nodeId}
      data-demo-record={attrs.recordId}
      data-demo-field={attrs.field}
      data-demo-item={attrs.itemId}
      data-demo-label={empty && field ? attrs.label : undefined}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.shiftKey && context.mode === "template" && (field || list))
          context.toggleSelection(selection);
        else choose();
        if (field && context.mode === "resume" && !editing)
          event.currentTarget.focus({ preventScroll: true });
      }}
      onFocus={(event: FocusEvent<HTMLDivElement>) => {
        event.stopPropagation();
        choose();
      }}
      data-demo-drag-kind={canDrag ? dragKind : undefined}
      data-demo-drag-id={record ? attrs.recordId : listItem ? attrs.itemId : attrs.nodeId}
      data-demo-drag-parent={parent?.id}
      data-demo-drag-label={label}
      data-demo-selectable={
        context.mode === "template" && selectable && (field || list) ? "true" : undefined
      }
      data-demo-schema={attrs.schemaId}
      data-demo-layout-node={attrs.nodeId}
      data-demo-layout-schema={attrs.schemaId}
      data-demo-layout-container={node.type.name === "demoContainer"}
    >
      {selectable && (field || record || list || node.type.name === "demoContainer") && (
        <div className={record ? "demo-block-tools" : "demo-node-tools"} contentEditable={false}>
          <button
            type="button"
            className={record ? "demo-block-handle" : "demo-icon"}
            aria-label={`${canDrag ? "Move" : "Select"} ${label}`}
            title={canDrag ? `Drag whole ${label}` : `Select ${label}`}
            style={{ touchAction: "none" }}
            onPointerDown={startDrag}
            onClick={(event) => {
              event.stopPropagation();
              choose();
            }}
          >
            <GripVertical size={13} />
            {record && (
              <span>
                {section ? "Section" : "Entry"} · {attrs.recordLabel || attrs.label}
              </span>
            )}
          </button>
          {(field || record) && context.mode === "resume" && (
            <button
              type="button"
              className="demo-icon"
              aria-label={`Suggestions for ${attrs.label}`}
              title="Scripted suggestions"
              onMouseEnter={() => {
                stopTimer();
                timer.current = setTimeout(startSuggestions, 450);
              }}
              onMouseLeave={stopTimer}
              onFocus={() => {
                stopTimer();
                timer.current = setTimeout(startSuggestions, 450);
              }}
              onBlur={stopTimer}
              onClick={(event) => {
                event.stopPropagation();
                stopTimer();
                startSuggestions();
              }}
            >
              <Sparkles size={13} />
            </button>
          )}
          {context.mode === "resume" &&
            entryFields.map((field) => (
              <button
                type="button"
                key={field.id}
                className="demo-icon demo-add-entry"
                aria-label={`Add ${demoSchema(field.schemaId).name.toLowerCase()}`}
                title={`Add blank ${demoSchema(field.schemaId).name.toLowerCase()}`}
                onClick={(event) => {
                  event.stopPropagation();
                  stopTimer();
                  context.addEntry(attrs.recordId, field.id);
                }}
              >
                <Plus size={14} />
              </button>
            ))}
        </div>
      )}
      <NodeViewContent className="demo-node-content" />
      {field && attrs.field === "endDate" && node.textContent && (
        <span className="sr-only" contentEditable={false}>
          {demoSchema(attrs.schemaId).name} end date
        </span>
      )}
    </NodeViewWrapper>
  );
}
const demoNodeAttributes = {
  nodeId: { default: "" },
  schemaId: { default: "" },
  recordId: { default: "" },
  recordLabel: { default: "" },
  field: { default: "" },
  itemId: { default: "" },
  label: { default: "" },
  kind: { default: "" },
  style: { default: null },
  empty: { default: false },
  blankRecord: { default: false },
  list: { default: false },
};
function demoNode(name: string, content: string) {
  return Node.create({
    name,
    group: "block",
    content,
    isolating: true,
    defining: true,
    addAttributes: () => demoNodeAttributes,
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: () => ["div", { "data-type": name }, 0],
    addNodeView: () =>
      ReactNodeViewRenderer(DemoNodeView, {
        attrs: ({ node }) => {
          const attrs = demoNodeAttrsSchema.parse(node.attrs);
          const minWidth =
            attrs.kind === "row"
              ? "min-content"
              : attrs.field === "startDate" || attrs.field === "endDate"
                ? attrs.empty
                  ? "9ch"
                  : "4ch"
                : "0";
          return {
            style: `min-width:${minWidth};flex:${attrs.field === "skills" && attrs.list ? "0 1 auto" : `${attrs.style.grow} 1 0%`}`,
          };
        },
      }),
  });
}
const demoNodes = [
  Node.create({ name: "doc", topNode: true, content: "demoSection*" }),
  Node.create({ name: "text", group: "inline" }),
  demoNode("demoSection", "demoContainer"),
  demoNode("demoRecord", "demoContainer"),
  demoNode("demoContainer", "(demoContainer | demoField | demoRepeat | demoList)*"),
  demoNode("demoRepeat", "demoRecord*"),
  demoNode("demoList", "demoField*"),
  demoNode("demoField", "text*"),
];
export function DemoEditor({
  records,
  layouts,
  context,
  onEdit,
  addBullet,
}: {
  records: DemoRecord[];
  layouts: DemoLayouts;
  context: DemoEditorContextValue;
  onEdit: (records: DemoRecord[], group?: string) => void;
  addBullet: (target: DemoTarget) => DemoTarget;
}) {
  const editingRef = useRef<DemoTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<DemoTarget | null>(null);
  const refs = useRef({ records, context, onEdit, addBullet });
  refs.current = { records, context, onEdit, addBullet };
  const acknowledged = useRef("");
  const previousLayouts = useRef(layouts);
  const pendingFocus = useRef<{ target: DemoTarget; edit: boolean } | null>(null);
  const editor = useEditor({
    extensions: [
      ...demoNodes,
      Extension.create({
        name: "demoEditingRules",
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              const parent = this.editor.state.selection.$from.parent;
              if (parent.type.name === "demoField") {
                const attrs = demoNodeAttrsSchema.parse(parent.attrs);
                if (attrs.list && refs.current.context.mode === "resume")
                  pendingFocus.current = {
                    target: refs.current.addBullet({
                      recordId: attrs.recordId,
                      field: attrs.field,
                      itemId: attrs.itemId,
                    }),
                    edit: true,
                  };
              }
              return true;
            },
          };
        },
        addProseMirrorPlugins() {
          return [
            new Plugin({
              filterTransaction: (transaction, state) =>
                !transaction.docChanged ||
                transaction.getMeta("demoProjection") === true ||
                (refs.current.context.mode === "resume" &&
                  demoCanEditDocument(
                    state.doc.toJSON(),
                    transaction.doc.toJSON(),
                    editingRef.current,
                  )),
            }),
          ];
        },
      }),
    ],
    immediatelyRender: false,
    editable: false,
    content: demoDocument(records, layouts),
    editorProps: {
      attributes: { "aria-label": "Résumé document", spellcheck: "false" },
      handlePaste: (view, event) => {
        if (refs.current.context.mode !== "resume" || !editingRef.current) return true;
        const text = event.clipboardData?.getData("text/plain").replace(/\s*\n\s*/g, " ") ?? "";
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (transaction.getMeta("demoProjection") || refs.current.context.mode !== "resume") return;
      const next = demoRecordsFromDocument(current.getJSON(), refs.current.records);
      acknowledged.current = JSON.stringify(next);
      const attrs = current.state.selection.$from.parent.attrs;
      refs.current.onEdit(
        next,
        `text:${String(attrs.recordId)}:${String(attrs.field)}:${String(attrs.itemId)}`,
      );
    },
  });
  const endEditing = useCallback(() => {
    editingRef.current = null;
    setEditingTarget(null);
    if (editor && !editor.isDestroyed) editor.setEditable(false, false);
  }, [editor]);
  const focusBlock = useCallback(
    (target: DemoTarget) => {
      const element = [
        ...(editor?.view.dom.querySelectorAll<HTMLElement>(".demo-demoField") ?? []),
      ].find(
        (element) =>
          element.dataset.demoRecord === target.recordId &&
          element.dataset.demoField === target.field &&
          (element.dataset.demoItem || undefined) === target.itemId,
      );
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "nearest" });
    },
    [editor],
  );
  const beginEditing = useCallback(
    (target: DemoTarget, coordinates?: { left: number; top: number }) => {
      if (!editor || context.mode !== "resume") return;
      let range: { from: number; to: number } | undefined;
      editor.state.doc.descendants((node, position) => {
        if (
          node.type.name === "demoField" &&
          node.attrs.recordId === target.recordId &&
          node.attrs.field === target.field &&
          (node.attrs.itemId || undefined) === target.itemId
        )
          range = { from: position + 1, to: position + node.nodeSize - 1 };
      });
      if (!range) {
        endEditing();
        return;
      }
      const position = coordinates ? editor.view.posAtCoords(coordinates)?.pos : range.to;
      editingRef.current = target;
      setEditingTarget(target);
      editor.setEditable(true, false);
      editor.commands.setTextSelection(
        Math.max(range.from, Math.min(position ?? range.to, range.to)),
      );
      editor.commands.focus();
    },
    [editor, context.mode, endEditing],
  );
  useEffect(() => {
    if (!editor) return;
    // Node views flush React portals synchronously; project after this effect finishes.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      if (context.mode !== "resume") {
        editingRef.current = null;
        setEditingTarget(null);
      }
      editor.setEditable(context.mode === "resume" && !!editingRef.current, false);
      const serialized = JSON.stringify(records);
      if (acknowledged.current === serialized && previousLayouts.current === layouts) return;
      const doc: JSONContent = demoDocument(records, layouts);
      editor.commands.command(({ tr }) => {
        const parsed = editor.schema.nodeFromJSON(doc);
        tr.replaceWith(0, tr.doc.content.size, parsed.content)
          .setMeta("demoProjection", true)
          .setMeta("addToHistory", false);
        return true;
      });
      acknowledged.current = serialized;
      previousLayouts.current = layouts;
      const request =
        pendingFocus.current ??
        (editingRef.current ? { target: editingRef.current, edit: true } : null);
      pendingFocus.current = null;
      if (request) {
        if (request.edit) beginEditing(request.target);
        else {
          endEditing();
          // New React node views must mount before their read-only field can receive focus.
          requestAnimationFrame(() => {
            if (
              !editor.isDestroyed &&
              refs.current.context.selection?.recordId === request.target.recordId
            )
              focusBlock(request.target);
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [records, layouts, editor, context.mode, beginEditing, endEditing, focusBlock]);
  return (
    <DemoEditorContext.Provider
      value={{
        ...context,
        editing: editingTarget,
        edit: beginEditing,
        select: (selection) => {
          const active = editingRef.current;
          if (
            active &&
            (selection.recordId !== active.recordId ||
              selection.field !== active.field ||
              selection.itemId !== active.itemId)
          )
            endEditing();
          context.select(selection);
        },
        addEntry: (parentId, field) => {
          endEditing();
          const target = context.addEntry(parentId, field);
          pendingFocus.current = target ? { target, edit: false } : null;
          return target;
        },
      }}
    >
      <EditorContent
        editor={editor}
        className={`demo-editor demo-mode-${context.mode}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) endEditing();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && editingRef.current) {
            const target = editingRef.current;
            event.preventDefault();
            event.stopPropagation();
            endEditing();
            focusBlock(target);
          }
          if (
            context.mode === "template" &&
            (event.key === "Backspace" || event.key === "Delete")
          ) {
            event.preventDefault();
            context.deleteContainer();
          }
        }}
      />
    </DemoEditorContext.Provider>
  );
}
