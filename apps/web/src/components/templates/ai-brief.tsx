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
import {
  generateTemplateAiTask,
  type getTemplatePromotion,
  previewTemplateAiInput,
} from "~/server/template-ai-functions";
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
  promotion,
  onClose,
  onStarted,
}: {
  initialBase: TemplateBase;
  detail?: TemplateDetail;
  promotion?: Extract<Awaited<ReturnType<typeof getTemplatePromotion>>, { ok: true }>["value"];
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [base, setBase] = useState(initialBase),
    [scope, setScope] = useState<TemplateScope>(
      detail?.design.scope ?? { level: "document", type: null },
    ),
    [name, setName] = useState(detail?.design.name ?? promotion?.destination?.name ?? ""),
    [destination, setDestination] = useState(promotion?.destination ? "base" : "new"),
    [reservedDesignId] = useState(() => detail?.design.id ?? newId()),
    [brief, setBrief] = useState<TemplateBrief>({
      structure: "Single column",
      density: "Comfortable",
      character: "",
      constraints: "",
    });
  const target = promotion
    ? destination === "base"
      ? promotion.destination
      : null
    : detail?.design;
  const input: StartTemplateAiRequest = {
    id: target?.id ?? null,
    revision: target?.revision ?? null,
    reservedDesignId: target?.id ?? reservedDesignId,
    expectedInputDigest: null,
    name,
    base,
    scope,
    brief,
    idempotencyKey: "input-preview",
    ...(promotion
      ? {
          sourcePromotion: {
            checkpointId: promotion.checkpointId,
            candidateDigest: promotion.candidateDigest,
          },
        }
      : {}),
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
      title={
        promotion
          ? "Promote a layout idea"
          : detail
            ? "Refine this template"
            : "Describe a template"
      }
      description={
        promotion
          ? "Turn a reusable layout idea into a new template Draft. Approved revisions are preserved."
          : "Design one component using a complete base graph and synthetic content."
      }
      onClose={onClose}
      dirty={Boolean(brief.character || brief.constraints)}
      pending={generate.isPending}
      wide
    >
      <fieldset className="min-w-0 space-y-6" disabled={generate.isPending}>
        {promotion && (
          <>
            <p className="font-mono text-xs tracking-wide text-muted-foreground">
              FROM ACCEPTED SOURCE CHECKPOINT
            </p>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Allowed layout adjustment</h3>
              <div className="rounded-sm bg-muted p-3 text-sm">
                {promotion.layout.state === "Isolated" ? (
                  <ul className="space-y-2">
                    {promotion.layout.changes.map((change) => (
                      <li key={change.property}>
                        {layoutLabels[change.property]}: {change.before} → {change.after}
                        {change.property === "font"
                          ? ""
                          : change.property === "margin"
                            ? " in"
                            : " pt"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="font-semibold">
                      {promotion.layout.state === "Unavailable"
                        ? "Layout change cannot be isolated"
                        : "No supported layout values changed"}
                    </p>
                    <p className="mt-2">
                      Describe the layout intent in a generic design brief below.
                    </p>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                This describes the latest accepted source adjustment. Template generation receives
                the generic brief, allowed values, base template and synthetic fixtures.
              </p>
            </section>
            <FormField label="Promotion destination">
              <select
                className={selectClass}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                {promotion.destination && (
                  <option value="base">New Draft revision of the base template</option>
                )}
                <option value="new">New template identity</option>
              </select>
            </FormField>
          </>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Template name">
            <Input maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <ScopePicker value={scope} onChange={setScope} disabled={Boolean(detail || promotion)} />
          <BasePicker value={base} onChange={setBase} disabled={Boolean(detail || promotion)} />
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
        <FormField label={promotion ? "Design brief" : "Visual character"}>
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
      </fieldset>
    </EvidenceDialog>
  );
}
const layoutLabels = {
  font: "Body font",
  bodySize: "Body size",
  sectionSpacing: "Section spacing",
  margin: "Page margin",
  paragraphSpacing: "Paragraph spacing",
} as const;
