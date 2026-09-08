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
import { BasePicker, CodePayload, useTemplateBase, useTemplateCommand } from "./shared";

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
            {resolved.data.design.name} · Version {resolved.data.revision.version} ·{" "}
            {resolved.data.revision.state}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Template details</summary>
            <p className="mt-2 break-all font-mono">{resolved.data.revision.id}</p>
          </details>
          <a
            className="inline-block text-sm text-primary underline"
            target="_blank"
            rel="noreferrer"
            href={`/templates?revisionId=${base.revisionId}`}
          >
            View template and sample PDFs
          </a>
        </>
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
        Current layout ·{" "}
        {current.data
          ? `${current.data.design.name} · Version ${current.data.revision.version}`
          : detail.draft.data.theme}
      </p>
      {current.data?.revision.state === "Retired" && (
        <Alert>
          <AlertDescription>
            This résumé keeps its retired template. You can still preview and export it. To change
            the layout, choose an approved template.
          </AlertDescription>
        </Alert>
      )}
      <BasePicker
        label="Template"
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
        </div>
      )}
      <Failure error={apply.error} />
      {!eligible && selected.data && (
        <p role="status" className="text-sm text-muted-foreground">
          This template is not approved yet. Choose an approved template to apply a new layout.
        </p>
      )}
      <Button
        disabled={waiting || apply.isPending || !eligible || !selected.graph || unchanged}
        onClick={save}
      >
        {apply.isPending ? "Applying…" : "Apply template to résumé"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Applying updates this résumé’s layout and prepares a PDF preview. Your wording and saved
        versions stay intact. The previous PDF stays visible while the new preview is prepared.
      </p>
    </section>
  );
}
