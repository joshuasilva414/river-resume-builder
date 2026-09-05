import type { SaveResumeRequest } from "@river/contracts";
import type { Composition } from "@river/domain";
import { effectiveStyles, type TemplateBase } from "@river/templates";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ResumeDetail } from "~/components/composition/use-draft";
import { Failure, unwrap } from "~/components/evidence/shared";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { updateResume } from "~/server/composition-functions";
import { BasePicker, CodePayload, GraphView, useTemplateBase, useTemplateCommand } from "./shared";

export function compositionBase(data: Composition): TemplateBase {
  return data.template
    ? { kind: "saved", revisionId: data.template.revisionId }
    : { kind: "fixed", theme: data.theme };
}
export function BindingInspection({ base }: { base: TemplateBase }) {
  const resolved = useTemplateBase(base);
  return (
    <div className="space-y-3">
      <Failure error={resolved.error} />
      {base.kind === "saved" && resolved.data && (
        <>
          <p className="text-sm">
            {resolved.data.design.name} · revision {resolved.data.revision.version} ·{" "}
            {resolved.data.revision.state}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {resolved.data.revision.id}
          </p>
          <a
            className="inline-block text-sm text-primary underline"
            target="_blank"
            rel="noreferrer"
            href={`/templates?revisionId=${base.revisionId}`}
          >
            Inspect exact graph and fixture previews
          </a>
        </>
      )}
      {resolved.graph && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Exact graph and resolved styles
          </summary>
          <div className="mt-4">
            <GraphView graph={resolved.graph} />
          </div>
        </details>
      )}
    </div>
  );
}
export function TemplateLayout({ detail, waiting }: { detail: ResumeDetail; waiting: boolean }) {
  const [selection, setSelection] = useState(() => compositionBase(detail.draft.data));
  const selected = useTemplateBase(selection),
    current = useTemplateBase(compositionBase(detail.draft.data)),
    client = useQueryClient();
  const apply = useTemplateCommand(
    async (input: Omit<SaveResumeRequest, "idempotencyKey">, key) =>
      unwrap(await updateResume({ data: { ...input, idempotencyKey: key } })),
    () => {
      void client.invalidateQueries({ queryKey: ["resumes"] });
    },
  );
  const eligible = selection.kind === "fixed" || selected.data?.revision.state === "Approved";
  const unchanged =
    selection.kind === "fixed"
      ? !detail.draft.data.template && selection.theme === detail.draft.data.theme
      : detail.draft.data.template?.revisionId === selection.revisionId;
  const save = () => {
    if (!selected.graph || !eligible) return;
    const { template: _previous, ...data } = detail.draft.data;
    apply.mutate({
      id: detail.draft.id,
      revision: detail.draft.revision,
      data: {
        ...data,
        theme: selected.graph.theme,
        ...(selection.kind === "saved" && selected.data
          ? { template: { designId: selected.data.design.id, revisionId: selection.revisionId } }
          : {}),
      },
    });
  };
  return (
    <section className="space-y-4 border-t pt-5">
      <h2 className="font-editorial text-2xl">Layout</h2>
      <p className="text-sm">
        Saved draft revision {detail.draft.revision} ·{" "}
        {current.data
          ? `${current.data.design.name} / ${current.data.revision.version}`
          : `${detail.draft.data.theme} / 1`}
      </p>
      {current.data?.revision.state === "Retired" && (
        <Alert>
          <AlertDescription>
            This draft and its checkpoints retain the retired graph. Existing preview and export
            remain available. A new binding requires an eligible graph.
          </AlertDescription>
        </Alert>
      )}
      <BasePicker
        label="Template graph"
        value={selection}
        onChange={setSelection}
        approvedOnly
        disabled={apply.isPending}
      />
      <BindingInspection base={selection} />
      {!unchanged && selected.graph && current.graph && (
        <div className="space-y-4">
          <CodePayload
            label="Before / after · document styles"
            value={{
              before: effectiveStyles(current.graph.tokens, current.graph.document.manifest),
              after: effectiveStyles(selected.graph.tokens, selected.graph.document.manifest),
            }}
          />
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Compare all components and inherited styles
            </summary>
            <div className="mt-4">
              <GraphView graph={selected.graph} original={current.graph} />
            </div>
          </details>
        </div>
      )}
      <Failure error={apply.error} />
      {!eligible && selected.data && (
        <p role="status" className="text-sm text-muted-foreground">
          The selected graph is unavailable for a new binding. Your current saved graph is
          unchanged. Choose an Approved revision.
        </p>
      )}
      <Button
        disabled={waiting || apply.isPending || !eligible || !selected.graph || unchanged}
        onClick={save}
      >
        {apply.isPending ? "Applying…" : "Apply graph to draft"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Applying saves a new revision and requests a PDF preview. Wording, evidence, placements, and
        existing checkpoints stay intact. The last successful PDF remains visible until the new
        preview succeeds.
      </p>
    </section>
  );
}
