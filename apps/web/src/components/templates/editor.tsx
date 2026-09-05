import type { SaveTemplateRequest } from "@river/contracts";
import { canonicalJson, newId } from "@river/domain";
import {
  editedGraph,
  scopedTemplate,
  type TemplateBase,
  type TemplateGraph,
  type TemplateManifest,
  type TemplateScope,
} from "@river/templates";
import { useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  RequestFailure,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getTemplate, saveTemplateDraft } from "~/server/template-functions";
import {
  BasePicker,
  CodePayload,
  ComponentPayload,
  GraphView,
  inheritedStyles,
  ScopePicker,
  scopeLabel,
  type TemplateDetail,
  useTemplate,
  useTemplateBase,
  useTemplateCommand,
} from "./shared";

type Setup = {
  base: TemplateBase;
  scope: TemplateScope;
  graph: TemplateGraph;
  detail?: TemplateDetail;
};
export function TemplateEditor({
  initialBase,
  detail,
  onClose,
  onSaved,
}: {
  initialBase: TemplateBase;
  detail?: TemplateDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [base, setBase] = useState(initialBase),
    [scope, setScope] = useState<TemplateScope>(
      detail?.design.scope ?? { level: "document", type: null },
    );
  const resolved = useTemplateBase(base);
  const [setup, setSetup] = useState<Setup | null>(() =>
    detail
      ? { base: initialBase, scope: detail.design.scope, graph: detail.revision.graph, detail }
      : null,
  );
  if (setup) return <TemplateForm setup={setup} onClose={onClose} onSaved={onSaved} />;
  return (
    <EvidenceDialog
      title="Create template"
      description="Start from an exact complete graph, then edit one component."
      onClose={onClose}
    >
      <div className="space-y-5">
        <BasePicker value={base} onChange={setBase} />
        <ScopePicker value={scope} onChange={setScope} />
        <Failure error={resolved.error} />
        <p className="text-sm text-muted-foreground">
          Contact is a document header Block. Each saved Draft retains the complete 14-component
          graph.
        </p>
        <Button
          disabled={!resolved.graph}
          onClick={() => {
            if (resolved.graph) setSetup({ base, scope, graph: resolved.graph });
          }}
        >
          Open template editor
        </Button>
      </div>
    </EvidenceDialog>
  );
}
function TemplateForm({
  setup,
  onClose,
  onSaved,
}: {
  setup: Setup;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [captured, setCaptured] = useState(setup);
  const original = scopedTemplate(captured.graph, captured.scope);
  const [name, setName] = useState(setup.detail?.design.name ?? ""),
    [source, setSource] = useState(original.source),
    [overrides, setOverrides] = useState(original.manifest.overrides);
  const [previewId] = useState(() => setup.detail?.design.id ?? newId());
  const [preserveName, setPreserveName] = useState("");
  const [tab, setTab] = useState<"edit" | "compare" | "graph">("edit");
  const current = useTemplate(captured.detail?.revision.id ?? null);
  const dirty =
    name !== (captured.detail?.design.name ?? "") ||
    source !== original.source ||
    canonicalJson(overrides) !== canonicalJson(original.manifest.overrides);
  const save = useTemplateCommand(
    async (input: Omit<SaveTemplateRequest, "idempotencyKey">, key) =>
      unwrap(await saveTemplateDraft({ data: { ...input, idempotencyKey: key } })),
    (result) => {
      if (result.revisionId) onSaved(result.revisionId);
    },
  );
  let proposed: TemplateGraph | undefined,
    problem: Error | null = null;
  try {
    proposed = editedGraph(
      captured.graph,
      captured.scope,
      previewId,
      (captured.detail?.design.revision ?? -1) + 2,
      source,
      overrides,
    );
  } catch (error) {
    problem = error instanceof Error ? error : new Error("Invalid template component.");
  }
  const conflict = save.error instanceof RequestFailure && save.error.problem.code === "Conflict";
  const input = {
    id: captured.detail?.design.id ?? null,
    revision: captured.detail?.design.revision ?? null,
    name,
    scope: captured.scope,
    base: captured.base,
    source,
    overrides,
  };
  const [reloadError, setReloadError] = useState<Error | null>(null);
  const loadCurrent = async () => {
    try {
      setReloadError(null);
      const fresh = (await current.refetch()).data;
      if (!fresh) return;
      const latest =
        fresh.design.currentRevisionId === fresh.revision.id
          ? fresh
          : unwrap(await getTemplate({ data: { revisionId: fresh.design.currentRevisionId } }));
      const component = scopedTemplate(latest.revision.graph, latest.design.scope);
      setCaptured({
        base: { kind: "saved", revisionId: latest.revision.id },
        scope: latest.design.scope,
        graph: latest.revision.graph,
        detail: latest,
      });
      setSource(component.source);
      setOverrides(component.manifest.overrides);
      setName(latest.design.name);
      save.reset();
    } catch (error) {
      setReloadError(
        error instanceof Error ? error : new Error("Unable to reload the saved template."),
      );
    }
  };
  return (
    <EvidenceDialog
      title={captured.detail ? "Edit template revision" : "Shape the template"}
      description={`${scopeLabel(captured.scope)} · saving creates a new Draft of the complete graph.`}
      onClose={onClose}
      dirty={dirty}
      pending={save.isPending}
      className="sm:max-w-[min(1320px,calc(100vw-3rem))]"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-5 lg:border-r lg:pr-6">
          <FormField label="Template name">
            <Input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <p className="eyebrow">{scopeLabel(captured.scope)}</p>
          <p className="break-all text-xs text-muted-foreground">
            Base:{" "}
            {captured.base.kind === "fixed"
              ? `${captured.base.theme} / 1`
              : captured.base.revisionId}
          </p>
          <TypedStyles
            graph={captured.graph}
            scope={captured.scope}
            values={overrides}
            onChange={setOverrides}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Identity and slot contracts are assigned by River. Typed controls update the manifest
            overrides. Approval applies to the complete graph after fixture validation and visual
            review.
          </p>
        </aside>
        <div className="min-w-0 space-y-5">
          <fieldset className="flex flex-wrap gap-2" aria-label="Template payload view">
            {(["edit", "compare", "graph"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={tab === value ? "secondary" : "outline"}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "edit"
                  ? "Manifest and fragment"
                  : value === "compare"
                    ? "Before / after"
                    : "All components"}
              </Button>
            ))}
          </fieldset>
          {tab === "edit" && (
            <div className="grid min-w-0 gap-5 xl:grid-cols-2">
              <CodePayload
                label="Complete manifest · identity assigned on save"
                value={{ ...original.manifest, overrides }}
              />
              <FormField label="Complete LaTeX fragment">
                <Textarea
                  className="min-h-[400px] font-mono text-xs leading-5"
                  value={source}
                  maxLength={32768}
                  spellCheck={false}
                  onChange={(event) => setSource(event.target.value)}
                />
              </FormField>
            </div>
          )}
          {tab === "compare" && (
            <div className="grid min-w-0 gap-5 xl:grid-cols-2">
              <ComponentPayload template={original} label="Captured original" />
              <ComponentPayload
                template={{ source, manifest: { ...original.manifest, overrides } }}
                label="Proposed · new identity assigned on save"
              />
            </div>
          )}
          {tab === "graph" && proposed && <GraphView graph={proposed} original={captured.graph} />}
          <Failure error={problem} />
          <Failure error={reloadError} />
          <Failure error={save.error} />
          {conflict && (
            <Alert>
              <AlertDescription>
                <div className="space-y-4">
                  <p>
                    Your local manifest and fragment are preserved. Compare the captured base with
                    the current saved graph before reloading.
                  </p>
                  {current.data && (
                    <details>
                      <summary className="cursor-pointer font-semibold">
                        Compare current saved graph
                      </summary>
                      <CodePayload
                        label={`Current design revision ${current.data.design.revision}`}
                        value={current.data.design}
                      />
                      {current.data.design.currentRevisionId !== current.data.revision.id ? (
                        <CurrentGraph id={current.data.design.currentRevisionId} />
                      ) : (
                        <GraphView graph={current.data.revision.graph} original={captured.graph} />
                      )}
                    </details>
                  )}
                  <Button variant="outline" onClick={() => void loadCurrent()}>
                    Reload explicitly
                  </Button>
                  <FormField label="New template name">
                    <Input
                      value={preserveName}
                      maxLength={160}
                      onChange={(event) => setPreserveName(event.target.value)}
                    />
                  </FormField>
                  <Button
                    variant="outline"
                    disabled={!preserveName.trim() || !proposed || save.isPending}
                    onClick={() =>
                      save.mutate({ ...input, id: null, revision: null, name: preserveName })
                    }
                  >
                    Preserve as new template Draft
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setSource(original.source);
                setOverrides(original.manifest.overrides);
                setName(captured.detail?.design.name ?? "");
                save.reset();
              }}
            >
              Discard changes
            </Button>
            <Button
              disabled={!name.trim() || !proposed || save.isPending || conflict}
              onClick={() => save.mutate(input)}
            >
              {save.isPending ? "Saving…" : "Save new Draft revision"}
            </Button>
          </div>
        </div>
      </div>
    </EvidenceDialog>
  );
}
function CurrentGraph({ id }: { id: string }) {
  const detail = useTemplate(id);
  return (
    <>
      <Failure error={detail.error} />
      {detail.data && <GraphView graph={detail.data.revision.graph} />}
    </>
  );
}
function TypedStyles({
  graph,
  scope,
  values,
  onChange,
}: {
  graph: TemplateGraph;
  scope: TemplateScope;
  values: TemplateManifest["overrides"];
  onChange: (value: TemplateManifest["overrides"]) => void;
}) {
  const inherited = inheritedStyles(graph, scope);
  const set = (key: keyof TemplateManifest["overrides"], value: string) => {
    const next = { ...values };
    delete next[key];
    if (value !== "inherit") {
      if (key === "font") {
        if (value === "Latin Modern Roman" || value === "Latin Modern Sans") next.font = value;
      } else next[key] = Number(value);
    }
    onChange(next);
  };
  return (
    <section className="space-y-4">
      <h3 className="font-sans text-sm font-semibold">Typed style overrides</h3>
      <FormField label="Font">
        <select
          className={selectClass}
          value={values.font ?? "inherit"}
          onChange={(event) => set("font", event.target.value)}
        >
          <option value="inherit">Inherit · {inherited.font}</option>
          <option>Latin Modern Roman</option>
          <option>Latin Modern Sans</option>
        </select>
      </FormField>
      {(
        [
          {
            key: "bodySize",
            label: "Body size",
            unit: "pt",
            choices: [9, 10, 11, 12],
            allowed: true,
          },
          {
            key: "sectionSpacing",
            label: "Section spacing",
            unit: "pt",
            choices: Array.from({ length: 17 }, (_, i) => i + 4),
            allowed: scope.level !== "block",
          },
          {
            key: "margin",
            label: "Margin",
            unit: "in",
            choices: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1],
            allowed: scope.level === "document",
          },
        ] as const
      ).map((field) =>
        field.allowed ? (
          <FormField key={field.key} label={field.label}>
            <select
              className={selectClass}
              value={values[field.key] ?? "inherit"}
              onChange={(event) => set(field.key, event.target.value)}
            >
              <option value="inherit">
                Inherit · {inherited[field.key]} {field.unit}
              </option>
              {values[field.key] !== undefined &&
                !field.choices.some((choice) => choice === values[field.key]) && (
                  <option value={values[field.key]}>
                    {values[field.key]} {field.unit}
                  </option>
                )}
              {field.choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} {field.unit}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <p key={field.key} className="text-xs text-muted-foreground">
            {field.label} · inherited {inherited[field.key]} {field.unit}. Change on{" "}
            {field.key === "margin" ? "Document" : "Document or Section"}.
          </p>
        ),
      )}
    </section>
  );
}
