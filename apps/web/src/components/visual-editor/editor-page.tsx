import {
  applyTemplate,
  blankGroup,
  blankResume,
  emptyDefinition,
  newIdentity,
  type WorkspaceRecord,
} from "@river/domain/workspace";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, MousePointer2, Redo2, Scan, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PdfPreview } from "~/components/pdf-preview";
import { Button } from "~/components/ui/button";
import { useRecordCommands, useRecords } from "~/components/workspace/queries";
import { inputClass } from "~/components/workspace/value-input";
import { getWorkspaceRecord } from "~/server/workspace";
import { AreaSelection } from "./area-selection";
import { VisualCanvas } from "./canvas";
import { ContentPanel } from "./content-panel";
import { FieldMapping } from "./field-mapping";
import { HistoryPanel } from "./history-panel";
import { JobPicker } from "./job-picker";
import { documentFonts } from "./pdf/fonts";
import { usePdf } from "./pdf/use-pdf";
import { contentPath } from "./projection";
import { ScorePanel } from "./score-panel";
import { SuggestionPanel } from "./suggestion-panel";
import { TemplateInspector } from "./template-inspector";
import type { EditorRecord } from "./use-draft";
import { useEditorController } from "./use-editor-controller";
import "./editor.css";

export default function EditorPage({
  id,
  kind,
  ownerId,
}: {
  id: string;
  kind: "template" | "resume";
  ownerId: string;
}) {
  const record = useQuery({
    queryKey: ["workspace", kind, id],
    queryFn: async () => {
      const result = await getWorkspaceRecord({ data: { id, kind } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  if (record.isPending) return <p className="p-10">Loading document…</p>;
  if (record.error)
    return (
      <div className="space-y-4 p-10">
        <h1 className="font-serif text-3xl">Document unavailable</h1>
        <p role="alert">{record.error.message}</p>
        <p>Documents from the previous editor remain in the read-only archive.</p>
        <a href="/archive" className="text-primary">
          Open archive
        </a>
      </div>
    );
  if (!record.data || record.data.kind !== kind)
    return <p className="p-10">This is a different record type.</p>;
  const initial = record.data;
  return initial.kind === "template" || initial.kind === "resume" ? (
    <DocumentEditor key={id} initial={initial} ownerId={ownerId} />
  ) : null;
}
function DocumentEditor({ initial, ownerId }: { initial: EditorRecord; ownerId: string }) {
  const c = useEditorController(initial, ownerId),
    records = useRecordCommands(),
    templates = useRecords("template");
  const [area, setArea] = useState(false),
    [canvasScale, setCanvasScale] = useState<"fit" | number>("fit"),
    [preview, setPreview] = useState(false),
    [history, setHistory] = useState(false),
    [scorecard, setScorecard] = useState(false),
    [sectionName, setSectionName] = useState(""),
    [error, setError] = useState<string | null>(null),
    [switching, setSwitching] = useState<Extract<WorkspaceRecord, { kind: "template" }> | null>(
      null,
    ),
    [mapping, setMapping] = useState<Record<string, string>>({});
  const pdf = usePdf(preview || history ? c.resume : null);
  const template = c.resume.template.document;
  const templateRows = templates.data?.filter((row) => row.kind === "template") ?? [];
  const captured = templateRows.find((row) => row.id === c.resume.template.id);
  const saveCopy = async () => {
    const id = newIdentity();
    try {
      await records.save.mutateAsync({
        id,
        revision: 0,
        idempotencyKey: newIdentity(),
        payload: {
          ...c.draft.payload,
          data: { ...c.draft.payload.data, name: `${c.draft.payload.data.name} copy` },
        } as typeof c.draft.payload,
      });
      window.location.assign(`/${c.mode === "template" ? "templates" : "resumes"}/${id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save a copy.");
    }
  };
  const drag = c.commands.drag;
  useEffect(() => () => drag.current?.(), [drag]);
  const createResume = async () => {
    try {
      if (!(await c.draft.flush())) return;
      const result = await getWorkspaceRecord({ data: { id: initial.id, kind: "template" } });
      if (!result.ok || result.value.kind !== "template")
        throw Error("Save this template before using it.");
      const id = newIdentity(),
        resume = blankResume(
          result.value.data,
          initial.id,
          result.value.revision,
          `${result.value.data.name} résumé`,
        );
      await records.save.mutateAsync({
        id,
        revision: 0,
        idempotencyKey: newIdentity(),
        payload: { kind: "resume", data: resume },
      });
      window.location.assign(`/resumes/${id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create résumé.");
    }
  };
  return (
    <div
      className="visual-workspace"
      onKeyDownCapture={(event) => {
        if (window.matchMedia("(max-width: 1023px)").matches) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.stopPropagation();
          event.shiftKey ? c.draft.redo() : c.draft.undo();
          return;
        }
        if (event.key === "Escape") {
          c.setEditing(null);
          setArea(false);
          return;
        }
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('input,textarea,select,[contenteditable="true"]')
        )
          return;
        if ((event.key === "Backspace" || event.key === "Delete") && c.selection.length) {
          event.preventDefault();
          event.stopPropagation();
          c.remove();
        }
        if (
          (event.key === "Enter" || event.key === "F2") &&
          c.mode === "resume" &&
          c.content?.kind === "field"
        ) {
          event.preventDefault();
          c.setEditing(c.content.id);
        }
      }}
    >
      <style>
        {documentFonts
          .flatMap((family) =>
            family.fonts.map(
              (font) =>
                `@font-face{font-family:'${family.family}';src:url('${font.src}') format('woff');font-weight:${font.fontWeight};font-style:${font.fontStyle};font-display:swap}`,
            ),
          )
          .join("\n")}
      </style>
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b bg-background px-6 py-4">
        <div className="flex min-w-64 items-center gap-3">
          <a
            href={c.mode === "template" ? "/templates" : "/resumes"}
            aria-label="Back to saved documents"
          >
            <ArrowLeft size={18} />
          </a>
          <div>
            <input
              aria-label="Document name"
              className="hidden w-full border-0 bg-transparent font-serif text-2xl outline-none lg:block"
              value={c.draft.payload.data.name}
              onChange={(event) =>
                c.draft.change(
                  (payload) =>
                    ({
                      ...payload,
                      data: { ...payload.data, name: event.target.value || "Untitled" },
                    }) as typeof payload,
                  "name",
                )
              }
            />
            <p className="font-serif text-2xl lg:hidden">{c.draft.payload.data.name}</p>
            <p role="status" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {c.draft.status === "saved" && <Check size={12} />}
              {
                {
                  loading: "Loading saved draft…",
                  saved: `Saved · revision ${c.draft.revision}`,
                  saving: "Saving…",
                  unsaved: "Unsaved changes",
                  conflict: "Save conflict · your edits are preserved",
                }[c.draft.status]
              }
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Undo"
            className="hidden lg:inline-flex"
            disabled={!c.draft.canUndo}
            onClick={c.draft.undo}
          >
            <Undo2 />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Redo"
            className="hidden lg:inline-flex"
            disabled={!c.draft.canRedo}
            onClick={c.draft.redo}
          >
            <Redo2 />
          </Button>
          <Button
            className="hidden lg:inline-flex"
            variant="ghost"
            size="sm"
            onClick={() => setScorecard(true)}
          >
            Scorecard
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>
            {preview ? "Edit canvas" : "PDF preview"}
          </Button>
          {c.mode === "resume" && (
            <Button size="sm" variant="outline" onClick={() => setHistory(true)}>
              Versions & export
            </Button>
          )}
          {c.mode === "template" ? (
            <Button className="hidden lg:inline-flex" size="sm" onClick={() => void createResume()}>
              Use template
            </Button>
          ) : (
            <Button className="hidden lg:inline-flex" variant="outline" size="sm" asChild>
              <a href={`/templates/${c.resume.template.id}`}>Edit template</a>
            </Button>
          )}
        </div>
      </header>
      {(error || c.commandError || c.draft.error || c.draft.storageError) && (
        <div className="space-y-2 border-b bg-amber-50 px-6 py-3 text-sm">
          <p role="alert">{error ?? c.commandError ?? c.draft.error ?? c.draft.storageError}</p>
          {c.draft.status === "conflict" ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void saveCopy()}>
                Save a separate copy
              </Button>
              <Button size="sm" variant="ghost" onClick={c.draft.discardRecovery}>
                Reload server version
              </Button>
            </div>
          ) : (
            c.draft.error && (
              <Button size="sm" variant="outline" onClick={() => void c.draft.retry()}>
                Retry saving
              </Button>
            )
          )}
        </div>
      )}
      {c.mode === "resume" && (
        <HistoryPanel
          id={initial.id}
          controller={c}
          open={history}
          onOpenChange={setHistory}
          pdf={pdf}
        />
      )}
      {scorecard && (
        <ScorePanel
          id={initial.id}
          ownerId={ownerId}
          controller={c}
          onClose={() => setScorecard(false)}
        />
      )}
      <div className="p-8 lg:hidden">
        <h2 className="font-serif text-2xl">Open on a larger screen to edit.</h2>
        <p className="mt-2 text-muted-foreground">
          You can browse your saved documents and download retained PDFs on this device.
        </p>
      </div>
      <div className="hidden min-h-[700px] lg:flex">
        <aside className="w-48 shrink-0 space-y-5 border-r p-4">
          <p className="text-[11px] uppercase text-muted-foreground">
            {c.mode === "template" ? "Template" : "Résumé"} sections
          </p>
          <nav className="space-y-1" aria-label="Document sections">
            {c.resume.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`w-full rounded p-2 text-left text-sm ${contentPath(c.resume.sections, c.selected?.contentId ?? "")[0]?.id === section.id ? "bg-primary/5 text-primary" : ""}`}
                onClick={() => {
                  const definition =
                    section.kind === "group"
                      ? template.definitions.find((item) => item.id === section.definitionId)
                      : undefined;
                  if (definition)
                    c.commands.select({
                      id: `${section.id}:${definition.layout.id}`,
                      layoutId: definition.layout.id,
                      definitionId: definition.id,
                      contentId: section.id,
                    });
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>
          {c.mode === "template" ? (
            <>
              <form
                className="space-y-2 border-t pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!sectionName.trim()) return;
                  const definition = emptyDefinition(sectionName.trim());
                  if (definition.layout.kind === "column")
                    definition.layout.children.push({
                      kind: "literal",
                      id: newIdentity(),
                      text: sectionName.trim(),
                      style: { fontFamily: "serif", fontSize: 15, borderBottom: true },
                    });
                  c.updateTemplate((template) => ({
                    ...template,
                    definitions: [...template.definitions, definition],
                    sections: [
                      ...template.sections,
                      {
                        id: newIdentity(),
                        key: `section-${newIdentity()}`,
                        label: sectionName.trim(),
                        definitionId: definition.id,
                      },
                    ],
                  }));
                  setSectionName("");
                }}
              >
                <input
                  aria-label="New section name"
                  className={inputClass}
                  placeholder="Publications, Workshops…"
                  value={sectionName}
                  onChange={(event) => setSectionName(event.target.value)}
                />
                <Button size="sm" variant="outline" type="submit" className="w-full">
                  Add section type
                </Button>
              </form>
              <div className="space-y-3 border-t pt-4">
                <label className="block text-xs">
                  Page size
                  <select
                    className={`${inputClass} mt-1`}
                    value={template.page.size}
                    onChange={(event) =>
                      c.updateTemplate((template) => ({
                        ...template,
                        page: {
                          ...template.page,
                          size: event.target.value === "A4" ? "A4" : "LETTER",
                        },
                      }))
                    }
                  >
                    <option value="LETTER">US Letter</option>
                    <option value="A4">A4</option>
                  </select>
                </label>
                <label className="block text-xs">
                  Margins (pt)
                  <input
                    type="number"
                    min={12}
                    max={100}
                    className={`${inputClass} mt-1`}
                    value={template.page.margin}
                    onChange={(event) =>
                      c.updateTemplate((template) => ({
                        ...template,
                        page: { ...template.page, margin: Number(event.target.value) },
                      }))
                    }
                  />
                </label>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Fictional samples show layout only. Your Fact Bank stays separate.
              </p>
            </>
          ) : (
            <>
              <JobPicker controller={c} />
              <label className="block text-xs">
                Add section
                <select
                  className={`${inputClass} mt-2`}
                  value=""
                  onChange={(event) => {
                    const section = template.sections.find(
                      (section) => section.id === event.target.value,
                    );
                    if (section)
                      c.updateResume((resume) => ({
                        ...resume,
                        sections: [
                          ...resume.sections,
                          blankGroup(template, section.definitionId, section.key, section.label),
                        ],
                      }));
                  }}
                >
                  <option value="">Choose a section…</option>
                  {template.sections
                    .filter(
                      (section) => !c.resume.sections.some((node) => node.key === section.key),
                    )
                    .map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs">
                Switch template
                <select
                  className={`${inputClass} mt-2`}
                  value=""
                  onChange={(event) => {
                    setSwitching(templateRows.find((row) => row.id === event.target.value) ?? null);
                    setMapping({});
                  }}
                >
                  <option value="">Choose a template…</option>
                  {templateRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.data.name}
                    </option>
                  ))}
                </select>
              </label>
              {captured && captured.revision !== c.resume.template.revision && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full whitespace-normal"
                  onClick={() => {
                    setSwitching(captured);
                    setMapping({});
                  }}
                >
                  Apply layout changes
                </Button>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Template version {c.resume.template.revision}. New entries inherit its layout.
              </p>
            </>
          )}
        </aside>
        <main className="min-w-0 flex-1">
          {preview ? (
            <section className="space-y-3 bg-muted/40 p-6">
              <p role="status" className="text-xs text-muted-foreground">
                {pdf.pending
                  ? "Rendering updated PDF…"
                  : (pdf.error ??
                    (pdf.fresh
                      ? "Current PDF · text completeness checked"
                      : "Last successful PDF · preview is out of date"))}
              </p>
              {pdf.result ? (
                <PdfPreview url={pdf.result.url} blob={pdf.result.blob} />
              ) : (
                <p>Preparing PDF preview…</p>
              )}
              <p className="text-xs text-muted-foreground">
                This is the generated PDF with exact pagination. The editable canvas is an
                approximation.
              </p>
            </section>
          ) : (
            <>
              <div className="flex items-center justify-between bg-muted/40 px-6 pt-4">
                <p className="text-xs text-muted-foreground">
                  {c.mode === "template" ? "Design template" : "Build résumé"}
                </p>
                <select
                  aria-label="Canvas zoom"
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={canvasScale}
                  onChange={(event) =>
                    setCanvasScale(
                      event.target.value === "fit" ? "fit" : Number(event.target.value),
                    )
                  }
                >
                  <option value="fit">Fit width</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                </select>
                {c.mode === "template" && (
                  <Button
                    size="sm"
                    variant={area ? "secondary" : "ghost"}
                    aria-pressed={area}
                    onClick={() => setArea(!area)}
                  >
                    {area ? <Scan /> : <MousePointer2 />}
                    {area ? "Area selection" : "Select area"}
                  </Button>
                )}
              </div>
              <AreaSelection
                active={area}
                enabled={c.mode === "template"}
                selection={c.selection}
                onSelection={c.setSelection}
              >
                <VisualCanvas commands={c.commands} scale={canvasScale} />
              </AreaSelection>
            </>
          )}
        </main>
        {switching ? (
          <aside className="visual-inspector space-y-4">
            <h2 className="font-serif text-2xl font-normal">Apply template</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Match sections and review their fields before applying. Compatible keys and types
              match automatically. Unmatched values remain under unused content.
            </p>
            {c.resume.sections.map((section) => {
              const key =
                mapping[section.id] ??
                (switching.data.sections.some((item) => item.key === section.key)
                  ? section.key
                  : "");
              const target = switching.data.sections.find((item) => item.key === key);
              const definition = switching.data.definitions.find(
                (item) => item.id === target?.definitionId,
              );
              return (
                <div key={section.id} className="space-y-3 border-b pb-3">
                  <label className="block text-xs">
                    {section.label}
                    <select
                      className={`${inputClass} mt-2`}
                      value={key}
                      onChange={(event) =>
                        setMapping({ ...mapping, [section.id]: event.target.value })
                      }
                    >
                      <option value="">Keep as unused content</option>
                      {switching.data.sections.map((item) => (
                        <option key={item.id} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {section.kind === "group" && definition && (
                    <details>
                      <summary className="cursor-pointer text-xs">Review field mapping</summary>
                      <FieldMapping
                        nodes={section.children}
                        definition={definition}
                        template={switching.data}
                        mapping={mapping}
                        onChange={setMapping}
                      />
                    </details>
                  )}
                </div>
              );
            })}
            <Button
              className="w-full"
              onClick={() => {
                c.updateResume((resume) =>
                  applyTemplate(
                    resume,
                    { id: switching.id, revision: switching.revision, document: switching.data },
                    mapping,
                  ),
                );
                setSwitching(null);
                c.setSelection([]);
              }}
            >
              Apply layout changes
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setSwitching(null)}>
              Cancel
            </Button>
          </aside>
        ) : c.mode === "template" ? (
          <TemplateInspector controller={c} />
        ) : c.suggestionTarget ? (
          <SuggestionPanel key={c.suggestionTarget} id={initial.id} controller={c} />
        ) : (
          <ContentPanel controller={c} />
        )}
      </div>
    </div>
  );
}
