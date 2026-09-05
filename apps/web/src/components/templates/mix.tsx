import type { MixTemplateRequest } from "@river/contracts";
import {
  replaceTemplate,
  scopedTemplate,
  type TemplateBase,
  type TemplateScope,
} from "@river/templates";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { mixTemplateGraph } from "~/server/template-functions";
import {
  BasePicker,
  ComponentPayload,
  GraphView,
  ScopePicker,
  scopeKey,
  scopeLabel,
  useTemplateBase,
  useTemplateCommand,
} from "./shared";

export function TemplateMixer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [base, setBase] = useState<TemplateBase>({ kind: "fixed", theme: "classic" }),
    [donor, setDonor] = useState<TemplateBase>({ kind: "fixed", theme: "minimal" });
  const [scope, setScope] = useState<TemplateScope>({ level: "document", type: null }),
    [name, setName] = useState("");
  const [picks, setPicks] = useState<
    readonly {
      scope: TemplateScope;
      donor: TemplateBase;
      component: ReturnType<typeof scopedTemplate>;
    }[]
  >([]);
  const baseDetail = useTemplateBase(base),
    donorDetail = useTemplateBase(donor);
  const save = useTemplateCommand(
    async (input: Omit<MixTemplateRequest, "idempotencyKey">, key) =>
      unwrap(await mixTemplateGraph({ data: { ...input, idempotencyKey: key } })),
    (result) => {
      if (result.revisionId) onSaved(result.revisionId);
    },
  );
  let graph = baseDetail.graph,
    error: Error | null = null;
  try {
    for (const pick of picks) if (graph) graph = replaceTemplate(graph, pick.scope, pick.component);
  } catch (failure) {
    error = failure instanceof Error ? failure : new Error("Incompatible component graph.");
  }
  const donorEligible = donor.kind === "fixed" || donorDetail.data?.revision.state === "Approved";
  const baseEligible = base.kind === "fixed" || baseDetail.data?.revision.state === "Approved";
  return (
    <EvidenceDialog
      title="Choose template components"
      description="Build a new Draft from exact eligible revisions. The complete combination needs its own validation and approval."
      onClose={onClose}
      dirty={Boolean(name || picks.length)}
      pending={save.isPending}
      className="sm:max-w-[min(1280px,calc(100vw-3rem))]"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <BasePicker value={base} onChange={setBase} approvedOnly />
          <FormField label="New template name">
            <Input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <ScopePicker value={scope} onChange={setScope} />
          <BasePicker label="Donor graph revision" value={donor} onChange={setDonor} approvedOnly />
          <Failure error={baseDetail.error} />
          <Failure error={donorDetail.error} />
          {donorDetail.graph && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Inspect exact donor component
              </summary>
              <div className="mt-4">
                <ComponentPayload
                  template={scopedTemplate(donorDetail.graph, scope)}
                  label="Selected donor"
                />
              </div>
            </details>
          )}
          <Button
            variant="outline"
            disabled={
              !donorDetail.graph ||
              !donorEligible ||
              picks.some((pick) => scopeKey(pick.scope) === scopeKey(scope))
            }
            onClick={() => {
              if (donorDetail.graph)
                setPicks([
                  ...picks,
                  { scope, donor, component: scopedTemplate(donorDetail.graph, scope) },
                ]);
            }}
          >
            Add replacement
          </Button>
          <section className="space-y-3">
            <h3 className="font-sans text-sm font-semibold">Current replacements</h3>
            {!picks.length && (
              <p className="text-sm text-muted-foreground">
                Choose a scoped component from an eligible donor.
              </p>
            )}
            {picks.map((pick) => (
              <div
                key={scopeKey(pick.scope)}
                className="flex min-w-0 items-center justify-between gap-3 border-b py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{scopeLabel(pick.scope)}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {pick.component.manifest.id} / {pick.component.manifest.revision}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicks(picks.filter((entry) => entry !== pick))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </section>
          <Failure error={error} />
          <Failure error={save.error} />
          <Button
            disabled={
              !name.trim() ||
              !picks.length ||
              !graph ||
              !baseEligible ||
              Boolean(error) ||
              save.isPending
            }
            onClick={() =>
              save.mutate({
                name,
                base,
                picks: picks.map(({ scope, donor }) => ({ scope, donor })),
              })
            }
          >
            Save combination as new Draft
          </Button>
        </div>
        <div className="min-w-0 space-y-5 lg:border-l lg:pl-6">
          {graph && <GraphView graph={graph} original={baseDetail.graph} />}
          <p className="text-xs leading-5 text-muted-foreground">
            Imported components inherit from their destination parents unless their own manifest
            declares a permitted override. A retired donor cannot be newly selected. Existing
            independently approved combinations retain their captured components.
          </p>
        </div>
      </div>
    </EvidenceDialog>
  );
}
