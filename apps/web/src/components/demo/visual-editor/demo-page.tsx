/** DEMO ONLY: fictional local workspace. No production saves, template publication, AI calls, or exports. */
import {
  ArrowDown,
  ArrowUp,
  MousePointer2,
  Plus,
  Redo2,
  Scan,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoAreaSelection, demoFormatSelection, demoSameSelection } from "./demo-area-selection";
import type { DemoDragRef, DemoDropPosition } from "./demo-drag";
import { DemoEditor, type DemoSelection } from "./demo-editor";
import {
  demoEmptyRecord,
  demoJobs,
  demoLibrary,
  demoPreviewSections,
  demoSeedSections,
} from "./demo-fixtures";
import { DemoHistoryShortcuts } from "./demo-history-shortcuts";
import { DemoLayoutInspector } from "./demo-layout-inspector";
import {
  type DemoLayoutNode,
  type DemoRecord,
  type DemoTarget,
  demoCloneRecord,
  demoDeleteContent,
  demoFindNode,
  demoFindRecord,
  demoMapRecords,
  demoMoveListItem,
  demoMoveNode,
  demoMoveRecordRelative,
  demoMoveRelative,
  demoNewId,
  demoNodePath,
  demoRecordLabel,
  demoReorderRecord,
  demoSchema,
  demoSchemas,
  demoUnwrapNode,
  demoWriteTarget,
} from "./demo-model";
import { useDemoState } from "./demo-state";
import {
  type DemoSuggestion,
  demoApplySuggestion,
  demoReplacementSuggestion,
  demoSuggestions,
} from "./demo-suggestions";
import "./demo.css";

type DemoLibraryRequest = {
  schemaId: string;
  targetId?: string;
  before?: DemoRecord;
  parentId?: string;
  field?: string;
  explanation?: string;
  job?: "product" | "implementation";
};
export default function DemoVisualEditorPage({ userId }: { userId: string }) {
  const session = useDemoState(userId);
  const { state, commit } = session;
  const [selection, setSelection] = useState<DemoSelection>({
    schemaId: "education-entry",
    nodeId: "education-entry-root",
    recordId: "demo-lakeside",
  });
  const [selectionVisible, setSelectionVisible] = useState(true);
  const [multiSelection, setMultiSelection] = useState<DemoSelection[]>([]);
  const [areaTool, setAreaTool] = useState(false);
  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMultiSelection([]);
        setSelectionVisible(false);
        setAreaTool(false);
      }
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);
  const [suggestTarget, setSuggestTarget] = useState<DemoTarget | null>(null);
  const [suggestion, setSuggestion] = useState<DemoSuggestion | null>(null);
  const [library, setLibrary] = useState<DemoLibraryRequest | null>(null);
  const [replacement, setReplacement] = useState<DemoRecord | null>(null);
  const [addSection, setAddSection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const drag: DemoDragRef = useRef(null);
  useEffect(
    () => () => {
      drag.current?.();
    },
    [],
  );
  const preview = useMemo(
    () => demoPreviewSections(state.previewCount, state.templateSectionOrder),
    [state.previewCount, state.templateSectionOrder],
  );
  const records = state.mode === "template" ? preview : state.sections;
  const selectedRecord = demoFindRecord(records, selection.recordId);
  const activeLayouts = state.mode === "template" ? state.layouts : state.appliedLayouts;
  const changedLayout =
    JSON.stringify(state.layouts) !== JSON.stringify(state.appliedLayouts) ||
    JSON.stringify(state.templateSectionOrder) !== JSON.stringify(state.appliedSectionOrder);
  const suggested = suggestTarget ? demoSuggestions(state.sections, suggestTarget, state.job) : [];
  const suggestedReplacement = suggestTarget
    ? demoReplacementSuggestion(state.sections, suggestTarget, state.job)
    : null;
  const select = (value: DemoSelection) => {
    setSelectionVisible(true);
    setMultiSelection([]);
    const allRecords = (items: DemoRecord[]): DemoRecord[] =>
      items.flatMap((item) => [item, ...allRecords(Object.values(item.children).flat())]);
    const requested = demoFindRecord(records, value.recordId);
    const record =
      requested?.schema.id === value.schemaId
        ? requested
        : requested
          ? allRecords(records).find((item) => item.schema.id === value.schemaId)
          : undefined;
    setSelection({ ...value, recordId: record?.id ?? value.recordId });
    setError(null);
  };
  const toggleSelection = (value: DemoSelection) => {
    setSelectionVisible(false);
    setMultiSelection((items) => {
      const current = items.length ? items : selection.field ? [selection] : [];
      return current.some((item) => demoSameSelection(item, value))
        ? current.filter((item) => !demoSameSelection(item, value))
        : [...current, value];
    });
  };
  const closePanels = () => {
    setAddSection(false);
    setLibrary(null);
    setReplacement(null);
    setSuggestTarget(null);
    setSuggestion(null);
    setError(null);
  };
  const openLibrary = (request: DemoLibraryRequest) => {
    closePanels();
    setLibrary(request);
  };
  const changeLayout = (schemaId: string, root: DemoLayoutNode) =>
    commit((current) => ({ ...current, layouts: { ...current.layouts, [schemaId]: root } }));
  const moveLayout = (schemaId: string, from: string, to: string, position: DemoDropPosition) => {
    const root = state.layouts[schemaId];
    if (!root) return;
    // Pointer moves are sibling-only. Reparenting requires the explicit Move into control.
    if (demoNodePath(root, from).at(-2)?.id !== demoNodePath(root, to).at(-2)?.id) return;
    changeLayout(schemaId, demoMoveNode(root, from, to, position));
  };
  const moveRecord = (from: string, to: string, position: DemoDropPosition) => {
    if (state.mode === "template") {
      const source = records.find((record) => record.id === from);
      const target = records.find((record) => record.id === to);
      if (source && target)
        commit((data) => ({
          ...data,
          templateSectionOrder: demoMoveRelative(
            data.templateSectionOrder,
            source.schema.id,
            target.schema.id,
            position,
          ),
        }));
    } else
      commit((data) => ({
        ...data,
        sections: demoMoveRecordRelative(data.sections, from, to, position),
      }));
  };
  const moveListItem = (source: DemoTarget, targetId: string, position: DemoDropPosition) => {
    commit((data) => ({
      ...data,
      sections: demoMoveListItem(data.sections, source, targetId, position),
    }));
  };
  const deleteContainer = () => {
    const root = state.layouts[selection.schemaId];
    if (!root) return;
    const selected = demoFindNode(root, selection.nodeId);
    const parent = demoNodePath(root, selection.nodeId).at(-2);
    if (!selected || !("children" in selected) || !parent) return;
    changeLayout(selection.schemaId, demoUnwrapNode(root, selected.id));
    select({ ...selection, nodeId: parent.id, field: undefined, itemId: undefined });
  };
  const deleteSelection = () => {
    if (multiSelection.length) {
      setError("Template fields are fixed. Select a row or column to delete its container.");
      return;
    }
    if (!selectionVisible) return;
    const root = activeLayouts[selection.schemaId];
    const node = root && demoFindNode(root, selection.nodeId);
    if (!root || !node) return;
    drag.current?.();
    if (state.mode === "template") {
      if (node.id !== root.id && "children" in node) deleteContainer();
      else
        setError(
          "Template fields and entry roots are fixed. Delete a row or column to unwrap its fields.",
        );
      return;
    }
    if (node.id !== root.id && !("field" in node)) {
      setError("Layout containers are locked here. Remove them in Design template.");
      return;
    }
    const target: DemoTarget = {
      recordId: selection.recordId,
      field: "field" in node ? node.field : "",
      itemId: selection.itemId,
    };
    commit((data) => ({ ...data, sections: demoDeleteContent(data.sections, target) }));
    setSelectionVisible(false);
    closePanels();
  };
  const suggest = (target: DemoTarget) => {
    closePanels();
    const record = demoFindRecord(state.sections, target.recordId);
    if (record)
      select({
        ...target,
        schemaId: record.schema.id,
        nodeId: `${record.schema.id}-${target.field || "root"}`,
      });
    setSuggestTarget(target);
  };
  const addBlankEntry = (parentId: string, fieldId: string): DemoTarget | null => {
    const parent = demoFindRecord(state.sections, parentId);
    const field =
      parent && demoSchema(parent.schema.id).fields.find((field) => field.id === fieldId);
    if (state.mode !== "resume" || !parent || field?.kind !== "records") return null;
    const record = demoEmptyRecord(field.schema.id);
    const firstField = demoSchema(record.schema.id).fields.find(
      (field) => field.kind !== "records" && field.kind !== "record" && field.kind !== "list",
    );
    commit((data) => ({
      ...data,
      sections: demoMapRecords(data.sections, parentId, (parent) => ({
        ...parent,
        children: {
          ...parent.children,
          [field.id]: [...(parent.children[field.id] ?? []), record],
        },
      })),
    }));
    closePanels();
    select({
      schemaId: record.schema.id,
      recordId: record.id,
      nodeId: `${record.schema.id}-${firstField?.id ?? "root"}`,
      field: firstField?.id,
    });
    return firstField ? { recordId: record.id, field: firstField.id } : null;
  };
  const addEntry = (schemaId: string) => {
    const parent = state.sections.find((record) =>
      demoSchema(record.schema.id).fields.some(
        (field) => field.kind === "records" && field.schema.id === schemaId,
      ),
    );
    if (!parent) {
      setAddSection(true);
      setError("Add the matching section first.");
      return;
    }
    openLibrary({ schemaId, parentId: parent.id, field: "entries" });
  };
  const appendRecord = (record: DemoRecord, request: DemoLibraryRequest) => {
    const copy = {
      ...demoCloneRecord(record),
      ...(request.targetId ? { id: request.targetId } : {}),
    };
    if (request.targetId) {
      const current = demoFindRecord(state.sections, request.targetId);
      if (
        !current ||
        JSON.stringify(current) !== JSON.stringify(request.before) ||
        (request.job && request.job !== state.job)
      ) {
        setError("This entry or job changed. Open the replacement picker again.");
        return;
      }
      commit((data) => ({
        ...data,
        sections: demoMapRecords(data.sections, current.id, () => copy),
      }));
    } else if (request.parentId && request.field) {
      const parentId = request.parentId,
        field = request.field;
      commit((data) => ({
        ...data,
        sections: demoMapRecords(data.sections, parentId, (parent) => ({
          ...parent,
          children: { ...parent.children, [field]: [...(parent.children[field] ?? []), copy] },
        })),
      }));
    }
    select({ schemaId: copy.schema.id, recordId: copy.id, nodeId: `${copy.schema.id}-root` });
    closePanels();
  };
  const newSection = (schemaId: string) => {
    const seed = demoSeedSections().find((record) => record.schema.id === schemaId);
    if (!seed) return;
    const record = demoCloneRecord(seed);
    if (record.children.entries) record.children.entries = [];
    commit((data) => ({ ...data, sections: [...data.sections, record] }));
    select({ schemaId, recordId: record.id, nodeId: `${schemaId}-root` });
    setAddSection(false);
  };
  const addBullet = (target: DemoTarget) => {
    const id = demoNewId();
    commit((data) => ({
      ...data,
      sections: demoMapRecords(data.sections, target.recordId, (record) => {
        const value = record.values[target.field];
        if (!Array.isArray(value)) return record;
        const items = [...value];
        const index = target.itemId
          ? items.findIndex((item) => item.id === target.itemId) + 1
          : items.length;
        items.splice(index, 0, { id, text: "" });
        return { ...record, values: { ...record.values, [target.field]: items } };
      }),
    }));
    select({
      ...selection,
      recordId: target.recordId,
      field: target.field,
      itemId: id,
      nodeId: `${selection.schemaId}-${target.field}`,
    });
    return { ...target, itemId: id };
  };
  const applyTemplate = () => {
    drag.current?.();
    setMultiSelection([]);
    setAreaTool(false);
    commit((data) => ({
      ...data,
      appliedLayouts: structuredClone(data.layouts),
      appliedSectionOrder: [...data.templateSectionOrder],
      sections:
        JSON.stringify(data.templateSectionOrder) === JSON.stringify(data.appliedSectionOrder)
          ? data.sections
          : [...data.sections].sort(
              (a, b) =>
                data.templateSectionOrder.indexOf(a.schema.id) -
                data.templateSectionOrder.indexOf(b.schema.id),
            ),
      mode: "resume",
    }));
    closePanels();
  };
  const switchMode = (mode: "template" | "resume") => {
    drag.current?.();
    setMultiSelection([]);
    setAreaTool(false);
    commit((data) => ({ ...data, mode }));
    closePanels();
  };
  const undo = () => {
    drag.current?.();
    session.undo();
    setError(null);
  };
  const redo = () => {
    drag.current?.();
    session.redo();
    setError(null);
  };
  const reset = () => {
    setMultiSelection([]);
    setAreaTool(false);
    session.reset();
    closePanels();
    setResetPending(false);
    setSelection({
      schemaId: "education-entry",
      nodeId: "education-entry-root",
      recordId: "demo-lakeside",
    });
  };
  return (
    <div className="demo-visual-editor">
      <DemoHistoryShortcuts undo={undo} redo={redo} deleteSelection={deleteSelection} />
      <header className="demo-page-header">
        <div>
          <div className="demo-title-row">
            <h1>Visual editor</h1>
            <span className="demo-badge">DEMO</span>
          </div>
          <p className="demo-muted">
            A template defines the layout. Your résumé supplies the story.
          </p>
        </div>
        <div className="demo-save">
          <span role="status">
            {session.storage === "saved"
              ? "Saved in this browser"
              : session.storage === "unavailable"
                ? "Not saved · browser storage unavailable"
                : session.storage === "invalid"
                  ? "Saved demo needs attention"
                  : "Loading demo…"}
          </span>
          <button type="button" className="demo-text-button" onClick={() => setResetPending(true)}>
            Reset demo
          </button>
        </div>
      </header>
      {resetPending && (
        <div className="demo-notice" role="alert">
          Reset this demo’s template and résumé? Your River data stays unchanged.
          <button type="button" onClick={reset}>
            Reset this demo
          </button>
          <button type="button" onClick={() => setResetPending(false)}>
            Cancel
          </button>
        </div>
      )}
      {session.storage === "invalid" ? (
        <div className="demo-notice" role="alert">
          The saved demo is unreadable or from an incompatible version. Reset it to load the
          fictional starter.
          <button type="button" onClick={reset}>
            Reset saved demo
          </button>
        </div>
      ) : session.storage === "loading" ? (
        <p className="demo-loading">Opening your local demo…</p>
      ) : (
        <>
          <div className="demo-toolbar">
            <fieldset className="demo-mode-tabs" aria-label="Editor mode">
              <button
                type="button"
                aria-pressed={state.mode === "template"}
                onClick={() => switchMode("template")}
              >
                Design template
              </button>
              <button
                type="button"
                aria-pressed={state.mode === "resume"}
                onClick={() => switchMode("resume")}
              >
                Build résumé
              </button>
            </fieldset>
            <div className="demo-button-row">
              <button
                type="button"
                className="demo-text-button"
                disabled={!session.canUndo}
                onClick={undo}
                title="Undo (⌘/Ctrl+Z)"
                aria-keyshortcuts="Meta+Z Control+Z"
              >
                <Undo2 size={15} /> Undo
              </button>
              <button
                type="button"
                className="demo-text-button"
                disabled={!session.canRedo}
                onClick={redo}
                title="Redo (⌘/Ctrl+Shift+Z)"
                aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
              >
                <Redo2 size={15} /> Redo
              </button>
              {state.mode === "template" ? (
                <button type="button" className="demo-primary" onClick={applyTemplate}>
                  {changedLayout ? "Apply layout changes" : "Use template"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    closePanels();
                    setAddSection(!addSection);
                  }}
                >
                  <Plus size={14} /> Add section
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="demo-notice" role="alert">
              {error}
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss message">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="demo-workspace">
            <aside className="demo-outline" aria-label="Document outline">
              <p className="demo-label">
                {state.mode === "template" ? "TEMPLATE BLOCKS" : "RÉSUMÉ SECTIONS"}
              </p>
              {records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={`demo-outline-item ${selection.schemaId.split("-")[0] === record.schema.id.split("-")[0] ? "demo-active" : ""}`}
                  onClick={() => {
                    select({
                      recordId: record.id,
                      schemaId: record.schema.id,
                      nodeId: `${record.schema.id}-root`,
                    });
                    closePanels();
                  }}
                >
                  {demoSchema(record.schema.id).name}
                </button>
              ))}
              {state.mode === "template" ? (
                <p className="demo-muted demo-help">
                  Drag a section by its section handle. Arrange fields and insert containers in the
                  layout inspector.
                </p>
              ) : (
                <>
                  <p className="demo-label demo-palette-label">CONTENT LIBRARY</p>
                  <button type="button" onClick={() => addEntry("experience-entry")}>
                    <Plus size={14} /> Add experience
                  </button>
                  <button type="button" onClick={() => addEntry("education-entry")}>
                    <Plus size={14} /> Add education
                  </button>
                  <p className="demo-muted demo-help">
                    Click to select a block. Double-click or press Enter to edit. Every new entry
                    inherits the template layout.
                  </p>
                </>
              )}
              <p className="demo-outline-footnote">
                Fictional content.
                <br />
                No changes to your River library.
              </p>
            </aside>
            <div className="demo-canvas">
              <div className="demo-canvas-caption">
                <span>EDITORIAL STARTER</span>
                <span>Continuous document</span>
              </div>
              {state.mode === "template" && (
                <div className="demo-selection-toolbar">
                  <fieldset className="demo-button-row" aria-label="Selection tool">
                    <button
                      type="button"
                      aria-pressed={!areaTool}
                      onClick={() => setAreaTool(false)}
                    >
                      <MousePointer2 size={14} /> Select
                    </button>
                    <button type="button" aria-pressed={areaTool} onClick={() => setAreaTool(true)}>
                      <Scan size={14} /> Area select
                    </button>
                  </fieldset>
                  <span className="demo-muted" role="status">
                    {multiSelection.length
                      ? `${multiSelection.length} blocks selected`
                      : areaTool
                        ? "Drag across fields to select · Esc to cancel"
                        : "Drag from the page margin to select an area"}
                  </span>
                  {multiSelection.length > 0 && (
                    <button
                      type="button"
                      className="demo-text-button"
                      onClick={() => setMultiSelection([])}
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              )}
              <DemoAreaSelection
                enabled={state.mode === "template"}
                active={areaTool}
                selection={multiSelection}
                onSelection={(items) => {
                  setMultiSelection(items);
                  setSelectionVisible(false);
                }}
                drag={drag}
              >
                <div className="demo-paper">
                  <DemoEditor
                    records={records}
                    layouts={activeLayouts}
                    context={{
                      mode: state.mode,
                      selection: selectionVisible && !areaTool ? selection : null,
                      select,
                      suggest,
                      move: moveLayout,
                      moveRecord,
                      moveListItem,
                      addEntry: addBlankEntry,
                      layouts: activeLayouts,
                      multiSelection,
                      toggleSelection,
                      drag,
                    }}
                    onEdit={(sections, group) => commit((data) => ({ ...data, sections }), group)}
                    addBullet={addBullet}
                  />
                  {!records.length && (
                    <div className="demo-empty-document">
                      <h2>Start with a section.</h2>
                      <p>Add content using your template’s block layouts.</p>
                      <button type="button" onClick={() => setAddSection(true)}>
                        Add section
                      </button>
                    </div>
                  )}
                </div>
              </DemoAreaSelection>
            </div>
            <aside
              className="demo-inspector"
              aria-label={state.mode === "template" ? "Layout inspector" : "Content inspector"}
            >
              {state.mode === "template" ? (
                multiSelection.length > 0 ? (
                  <>
                    <span className="demo-caption">AREA SELECTION</span>
                    <h2>{multiSelection.length} blocks selected</h2>
                    <p className="demo-muted">
                      Format the selected fields together. Shared entry fields update in every
                      sample.
                    </p>
                    <label className="demo-control">
                      Font
                      <select
                        aria-label="Selected blocks font"
                        value=""
                        onChange={(event) =>
                          commit((data) => ({
                            ...data,
                            layouts: demoFormatSelection(data.layouts, multiSelection, {
                              fontFamily: event.target.value === "serif" ? "serif" : "sans",
                            }),
                          }))
                        }
                      >
                        <option value="" disabled>
                          Choose font…
                        </option>
                        <option value="sans">Instrument Sans</option>
                        <option value="serif">Newsreader</option>
                      </select>
                    </label>
                    <div>
                      <p className="demo-label">Alignment</p>
                      <div className="demo-button-row">
                        {(["left", "center", "right"] as const).map((align) => (
                          <button
                            type="button"
                            key={align}
                            onClick={() =>
                              commit((data) => ({
                                ...data,
                                layouts: demoFormatSelection(data.layouts, multiSelection, {
                                  align,
                                }),
                              }))
                            }
                          >
                            {align[0]?.toUpperCase()}
                            {align.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="demo-label">Weight</p>
                      <div className="demo-button-row">
                        {(["normal", "bold"] as const).map((weight) => (
                          <button
                            type="button"
                            key={weight}
                            onClick={() =>
                              commit((data) => ({
                                ...data,
                                layouts: demoFormatSelection(data.layouts, multiSelection, {
                                  weight,
                                }),
                              }))
                            }
                          >
                            {weight === "bold" ? "Semibold" : "Regular"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="demo-muted">
                      Shift-click fields to add or remove them. Escape clears selection. Field
                      bindings stay in their containers.
                    </p>
                    <button type="button" onClick={() => setMultiSelection([])}>
                      Done selecting
                    </button>
                  </>
                ) : (
                  <DemoLayoutInspector
                    layouts={state.layouts}
                    selection={selection}
                    select={select}
                    change={changeLayout}
                    previewCount={state.previewCount}
                    setPreviewCount={(previewCount) =>
                      commit((data) => ({ ...data, previewCount }))
                    }
                    drag={drag}
                    deleteContainer={deleteContainer}
                  />
                )
              ) : (
                <>
                  <div className="demo-inspector-heading">
                    <label className="demo-caption" htmlFor="demo-job">
                      SAMPLE JOB
                    </label>
                    <select
                      id="demo-job"
                      value={state.job}
                      onChange={(event) => {
                        const job =
                          event.target.value === "implementation" ? "implementation" : "product";
                        commit((data) => ({ ...data, job }));
                      }}
                    >
                      <option value="product">Product Engineer</option>
                      <option value="implementation">Implementation Engineer</option>
                    </select>
                    <p className="demo-job-description">{demoJobs[state.job].description}</p>
                  </div>
                  {addSection ? (
                    <>
                      <h2>Add a section</h2>
                      <p className="demo-muted">
                        Choose one of the template’s existing section types.
                      </p>
                      {demoSchemas
                        .filter((schema) => schema.level === "section")
                        .map((schema) => (
                          <button
                            type="button"
                            key={schema.id}
                            onClick={() => newSection(schema.id)}
                          >
                            <Plus size={14} /> {schema.name}
                          </button>
                        ))}
                      <button type="button" onClick={() => setAddSection(false)}>
                        Cancel
                      </button>
                    </>
                  ) : library ? (
                    <>
                      <div className="demo-inspector-title">
                        <h2>{library.targetId ? "Replace content" : "Add an entry"}</h2>
                        <button
                          type="button"
                          className="demo-icon"
                          onClick={closePanels}
                          aria-label="Close content library"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p className="demo-muted">
                        Fictional content library · your layout stays the same.
                      </p>
                      {library.explanation && <p className="demo-muted">{library.explanation}</p>}
                      {library.targetId &&
                        (() => {
                          const original = library.before;
                          return original ? (
                            <div>
                              <p className="demo-label">BEFORE</p>
                              <p className="demo-before">{demoRecordPreview(original)}</p>
                            </div>
                          ) : null;
                        })()}
                      {demoLibrary
                        .filter((record) => record.schema.id === library.schemaId)
                        .map((record) => (
                          <button
                            type="button"
                            className={`demo-library-item ${replacement?.id === record.id ? "demo-active" : ""}`}
                            key={record.id}
                            onClick={() => setReplacement(record)}
                          >
                            <strong>{demoRecordLabel(record)}</strong>
                            <span>{String(record.values.title ?? record.values.degree ?? "")}</span>
                          </button>
                        ))}
                      {replacement && (
                        <>
                          <p className="demo-label">
                            {library.targetId ? "REPLACE WITH" : "ADD TO RÉSUMÉ"}
                          </p>
                          <div className="demo-proposed">{demoRecordPreview(replacement)}</div>
                          <button
                            type="button"
                            className="demo-primary"
                            onClick={() => appendRecord(replacement, library)}
                          >
                            {library.targetId ? "Replace entry" : "Add this entry"}
                          </button>
                        </>
                      )}
                      {!library.targetId && (
                        <button
                          type="button"
                          onClick={() => appendRecord(demoEmptyRecord(library.schemaId), library)}
                        >
                          Write a new entry
                        </button>
                      )}
                    </>
                  ) : suggestTarget ? (
                    <>
                      <div className="demo-inspector-title">
                        <span className="demo-badge">SCRIPTED SUGGESTIONS</span>
                        <button
                          type="button"
                          className="demo-icon"
                          onClick={closePanels}
                          aria-label="Close suggestions"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {suggestion ? (
                        <>
                          <h2>{suggestion.title}</h2>
                          <div>
                            <p className="demo-label">BEFORE</p>
                            <p className="demo-before">{suggestion.before}</p>
                          </div>
                          <div>
                            <p className="demo-label">SUGGESTED</p>
                            <p className="demo-proposed">{suggestion.after}</p>
                          </div>
                          <p className="demo-muted">{suggestion.explanation}</p>
                          <button
                            type="button"
                            className="demo-primary"
                            onClick={() => {
                              try {
                                const next = demoApplySuggestion(state, suggestion);
                                commit(() => next);
                                closePanels();
                              } catch (issue) {
                                setError(
                                  issue instanceof Error
                                    ? issue.message
                                    : "Unable to apply this suggestion.",
                                );
                              }
                            }}
                          >
                            Apply suggestion
                          </button>
                          <button type="button" onClick={() => setSuggestion(null)}>
                            Back to suggestions
                          </button>
                        </>
                      ) : (
                        <>
                          <h2>For this block</h2>
                          <p className="demo-muted">
                            Alternatives for {demoJobs[state.job].title}. Preview before applying.
                          </p>
                          {suggestedReplacement && suggestTarget && (
                            <button
                              type="button"
                              className="demo-suggestion-item"
                              onClick={() => {
                                const proposed = suggestedReplacement;
                                openLibrary({
                                  schemaId: proposed.replacement.schema.id,
                                  targetId: suggestTarget.recordId,
                                  before: proposed.before,
                                  explanation: proposed.explanation,
                                  job: state.job,
                                });
                                setReplacement(proposed.replacement);
                              }}
                            >
                              <Sparkles size={14} />
                              <span>
                                <strong>
                                  Try {demoRecordLabel(suggestedReplacement.replacement)}
                                </strong>
                                <small>{suggestedReplacement.explanation}</small>
                              </span>
                            </button>
                          )}
                          {suggested.length ? (
                            suggested.map((item) => (
                              <button
                                type="button"
                                className="demo-suggestion-item"
                                key={item.id}
                                onClick={() => setSuggestion(item)}
                              >
                                <Sparkles size={14} />
                                <span>
                                  <strong>{item.title}</strong>
                                  <small>{item.explanation}</small>
                                </span>
                              </button>
                            ))
                          ) : !suggestedReplacement ? (
                            <p className="demo-empty-suggestions">
                              No scripted suggestions for this block and job. Try the sample summary
                              or a Northstar Studio bullet.
                            </p>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="demo-badge">SCRIPTED SUGGESTIONS</span>
                      <p className="demo-muted">
                        Hover over a block’s sparkle, or select a field below to explore
                        alternatives.
                      </p>
                      {selectedRecord && (
                        <>
                          <h2>{demoRecordLabel(selectedRecord)}</h2>
                          <div className="demo-button-row">
                            <button
                              type="button"
                              onClick={() =>
                                commit((data) => ({
                                  ...data,
                                  sections: demoReorderRecord(data.sections, selectedRecord.id, -1),
                                }))
                              }
                            >
                              <ArrowUp size={14} /> Up
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                commit((data) => ({
                                  ...data,
                                  sections: demoReorderRecord(data.sections, selectedRecord.id, 1),
                                }))
                              }
                            >
                              <ArrowDown size={14} /> Down
                            </button>
                          </div>
                          {demoSchema(selectedRecord.schema.id).level === "entry" && (
                            <button
                              type="button"
                              onClick={() =>
                                openLibrary({
                                  schemaId: selectedRecord.schema.id,
                                  targetId: selectedRecord.id,
                                  before: selectedRecord,
                                })
                              }
                            >
                              Replace from library
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              commit((data) => ({
                                ...data,
                                sections: demoMapRecords(
                                  data.sections,
                                  selectedRecord.id,
                                  () => null,
                                ),
                              }));
                              closePanels();
                            }}
                          >
                            <Trash2 size={14} /> Remove{" "}
                            {demoSchema(selectedRecord.schema.id).level === "entry"
                              ? "entry"
                              : "section"}
                          </button>
                          {demoSchema(selectedRecord.schema.id).fields.map((field) => {
                            const value = selectedRecord.values[field.id];
                            if (field.kind === "records" || field.kind === "record")
                              return (
                                <button
                                  type="button"
                                  key={field.id}
                                  onClick={() =>
                                    openLibrary({
                                      schemaId: field.schema.id,
                                      parentId: selectedRecord.id,
                                      field: field.id,
                                    })
                                  }
                                >
                                  <Plus size={14} /> Add {field.label.toLowerCase()}
                                </button>
                              );
                            if (Array.isArray(value))
                              return (
                                <div key={field.id}>
                                  <p className="demo-label">{field.label}</p>
                                  {value.map((item, index) => (
                                    <div className="demo-list-control" key={item.id}>
                                      <textarea
                                        aria-label={`${field.label} item`}
                                        value={item.text}
                                        onChange={(event) =>
                                          commit(
                                            (data) => ({
                                              ...data,
                                              sections: demoWriteTarget(
                                                data.sections,
                                                {
                                                  recordId: selectedRecord.id,
                                                  field: field.id,
                                                  itemId: item.id,
                                                },
                                                event.target.value,
                                              ),
                                            }),
                                            `text:${selectedRecord.id}:${field.id}:${item.id}`,
                                          )
                                        }
                                      />
                                      <div className="demo-button-row">
                                        {([-1, 1] as const).map((direction) => (
                                          <button
                                            type="button"
                                            key={direction}
                                            aria-label={`Move ${field.label.toLowerCase()} item ${index + 1} ${direction < 0 ? "up" : "down"}`}
                                            disabled={!value[index + direction]}
                                            onClick={() => {
                                              const sibling = value[index + direction];
                                              if (sibling)
                                                moveListItem(
                                                  {
                                                    recordId: selectedRecord.id,
                                                    field: field.id,
                                                    itemId: item.id,
                                                  },
                                                  sibling.id,
                                                  direction < 0 ? "before" : "after",
                                                );
                                            }}
                                          >
                                            {direction < 0 ? (
                                              <ArrowUp size={12} />
                                            ) : (
                                              <ArrowDown size={12} />
                                            )}
                                          </button>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            suggest({
                                              recordId: selectedRecord.id,
                                              field: field.id,
                                              itemId: item.id,
                                            })
                                          }
                                        >
                                          <Sparkles size={12} /> Suggestions
                                        </button>
                                        <button
                                          type="button"
                                          aria-label="Remove list item"
                                          onClick={() =>
                                            commit((data) => ({
                                              ...data,
                                              sections: demoMapRecords(
                                                data.sections,
                                                selectedRecord.id,
                                                (record) => ({
                                                  ...record,
                                                  values: {
                                                    ...record.values,
                                                    [field.id]: value.filter(
                                                      (entry) => entry.id !== item.id,
                                                    ),
                                                  },
                                                }),
                                              ),
                                            }))
                                          }
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addBullet({ recordId: selectedRecord.id, field: field.id })
                                    }
                                  >
                                    <Plus size={12} /> Add item
                                  </button>
                                </div>
                              );
                            return (
                              <label className="demo-control" key={field.id}>
                                {field.label}
                                <input
                                  value={typeof value === "string" ? value : ""}
                                  onChange={(event) =>
                                    commit(
                                      (data) => ({
                                        ...data,
                                        sections: demoWriteTarget(
                                          data.sections,
                                          { recordId: selectedRecord.id, field: field.id },
                                          event.target.value,
                                        ),
                                      }),
                                      `text:${selectedRecord.id}:${field.id}`,
                                    )
                                  }
                                />
                                {field.id === "summary" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      suggest({ recordId: selectedRecord.id, field: field.id })
                                    }
                                  >
                                    <Sparkles size={13} /> Suggestions
                                  </button>
                                )}
                              </label>
                            );
                          })}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function demoRecordPreview(record: DemoRecord) {
  return Object.values(record.values)
    .flatMap((value) =>
      typeof value === "string" ? (value ? [value] : []) : value.map((item) => item.text),
    )
    .join(" · ");
}
