import type { StartTemplateAiRequest } from "@river/contracts";
import { canonicalJson, newId } from "@river/domain";
import type { TemplateBase, TemplateBrief, TemplateScope } from "@river/templates";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { generateTemplateAiTask, previewTemplateAiInput } from "~/server/template-ai-functions";
import {
  BasePicker,
  CodePayload,
  ScopePicker,
  type TemplateDetail,
  useTemplateCommand,
} from "./shared";

export function TemplateAiBrief({
  initialBase,
  detail,
  onClose,
  onStarted,
}: {
  initialBase: TemplateBase;
  detail?: TemplateDetail;
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [base, setBase] = useState(initialBase),
    [scope, setScope] = useState<TemplateScope>(
      detail?.design.scope ?? { level: "document", type: null },
    ),
    [name, setName] = useState(detail?.design.name ?? ""),
    [reservedDesignId] = useState(() => detail?.design.id ?? newId()),
    [brief, setBrief] = useState<TemplateBrief>({
      structure: "Single column",
      density: "Comfortable",
      character: "",
      constraints: "",
    });
  const input: StartTemplateAiRequest = {
    id: detail?.design.id ?? null,
    revision: detail?.design.revision ?? null,
    reservedDesignId,
    expectedInputDigest: null,
    name,
    base,
    scope,
    brief,
    idempotencyKey: "input-preview",
  };
  const preview = useMutation({
    mutationFn: async (request: StartTemplateAiRequest) => ({
      request,
      value: unwrap(await previewTemplateAiInput({ data: request })),
    }),
  });
  const current =
    preview.data && canonicalJson(preview.data.request) === canonicalJson(input)
      ? preview.data.value
      : null;
  const generate = useTemplateCommand(
    async (request: Omit<StartTemplateAiRequest, "idempotencyKey">, key) =>
      unwrap(await generateTemplateAiTask({ data: { ...request, idempotencyKey: key } })),
    (result) => onStarted(result.id),
  );
  return (
    <EvidenceDialog
      title={detail ? "Refine this template" : "Describe a template"}
      description="Design one component using a complete base graph and synthetic content."
      onClose={onClose}
      dirty={Boolean(brief.character || brief.constraints)}
      pending={generate.isPending}
      wide
    >
      <div className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Template name">
            <Input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <ScopePicker value={scope} onChange={setScope} disabled={Boolean(detail)} />
          <BasePicker value={base} onChange={setBase} disabled={Boolean(detail)} />
          <FormField label="Density">
            <select
              className={selectClass}
              value={brief.density}
              onChange={(event) => {
                const density = event.target.value;
                if (density === "Compact" || density === "Comfortable" || density === "Open")
                  setBrief({ ...brief, density });
              }}
            >
              <option>Compact</option>
              <option>Comfortable</option>
              <option>Open</option>
            </select>
          </FormField>
        </div>
        <p className="text-base md:text-sm text-muted-foreground">
          Single column · All seven content types · Synthetic fixtures only
        </p>
        <FormField label="Visual character">
          <Textarea
            value={brief.character}
            maxLength={2000}
            placeholder="Quiet headings, a readable sans-serif body, and restrained spacing."
            onChange={(event) => setBrief({ ...brief, character: event.target.value })}
          />
        </FormField>
        <FormField label="Design constraints">
          <Textarea
            value={brief.constraints}
            maxLength={4000}
            placeholder="Describe generic layout requirements. Keep personal content in your résumé."
            onChange={(event) => setBrief({ ...brief, constraints: event.target.value })}
          />
        </FormField>
        <Failure error={preview.error} />
        <Failure error={generate.error} />
        <Button
          variant="outline"
          disabled={
            !name.trim() || !brief.character.trim() || preview.isPending || generate.isPending
          }
          onClick={() => preview.mutate(input)}
        >
          Review complete synthetic input
        </Button>
        {current && (
          <section className="space-y-4 rounded-sm border p-5">
            <h3 className="font-editorial text-2xl">What the model receives</h3>
            <p className="text-base md:text-sm">
              This exact brief, complete base graph, component scope, and four canonical synthetic
              fixtures. {current.characters.toLocaleString()} of {current.limit.toLocaleString()}{" "}
              UTF-16 units.{" "}
              {current.allowed
                ? "Input fits without truncation."
                : "Input exceeds the limit; generation is blocked."}
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Inspect complete input and identity
              </summary>
              <CodePayload label="Exact generation input" value={current.input} />
              <CodePayload label="Input digest" value={current.digest} />
            </details>
            <Button
              disabled={!current.allowed || generate.isPending}
              onClick={() => generate.mutate({ ...input, expectedInputDigest: current.digest })}
            >
              {generate.isPending ? "Starting proposal…" : "Generate proposal"}
            </Button>
          </section>
        )}
        <p className="text-base md:text-sm text-muted-foreground">
          Generation and preview have separate three-attempt budgets. Review the resulting graph and
          its synthetic PDF before accepting a new Draft.
        </p>
      </div>
    </EvidenceDialog>
  );
}
