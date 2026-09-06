import type {
  ApproveTemplateRequest,
  RetireTemplateRequest,
  StartTemplateValidationRequest,
} from "@river/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation } from "~/server/functions";
import {
  approveTemplateRevision,
  getTemplateValidation,
  retireTemplateRevision,
  validateTemplateDraft,
} from "~/server/template-functions";
import { CodePayload, type TemplateDetail, useTemplateCommand } from "./shared";

export function TemplateValidation({ detail }: { detail: TemplateDetail }) {
  const [selected, setSelected] = useState<string | null>(null),
    [retiring, setRetiring] = useState(false);
  const start = useTemplateCommand(
    async (input: Omit<StartTemplateValidationRequest, "idempotencyKey">, key) =>
      unwrap(
        await validateTemplateDraft({
          data: {
            ...input,
            idempotencyKey: key,
          },
        }),
      ),
    (result) => setSelected(result.id),
  );
  const active = detail.validations.some((item) =>
    ["Pending", "Running"].includes(item.operation.state),
  );
  return (
    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-semibold">Test with sample résumés</h3>
        <Badge variant="outline">{detail.revision.state}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        River renders each sample twice to check text accuracy, consistent output, and required
        document resources. These checks must pass before you review and approve the sample PDFs.
      </p>
      <Failure error={start.error} />
      {detail.revision.state === "Draft" && detail.validationConfigured && (
        <Button
          disabled={active || start.isPending || detail.revision.validationAttempts >= 3}
          onClick={() =>
            start.mutate({
              revisionId: detail.revision.id,
              revision: detail.revision.reviewRevision,
            })
          }
        >
          {active
            ? "Validation in progress"
            : detail.revision.validationAttempts
              ? `Retry validation · ${3 - detail.revision.validationAttempts} attempts left`
              : "Test with sample résumés"}
        </Button>
      )}
      {detail.revision.state === "Approved" && (
        <Button variant="outline" onClick={() => setRetiring(true)}>
          Retire this revision
        </Button>
      )}
      {detail.revision.state === "Retired" && (
        <p className="text-sm text-muted-foreground">
          Existing résumés and checkpoints keep this template revision. It is unavailable for new
          selections.
        </p>
      )}
      {!detail.validations.length && (
        <p className="text-sm text-muted-foreground">No validation runs yet.</p>
      )}
      {detail.validations.map((item) => (
        <button
          key={item.validation.id}
          type="button"
          className="block w-full space-y-2 border-b py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setSelected(item.validation.id)}
        >
          <span className="block text-sm font-medium">{item.operation.stage}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {item.operation.state} · {new Date(item.validation.createdAt).toLocaleString()} ·{" "}
            {item.validation.id.slice(-8)}
          </span>
        </button>
      ))}
      {selected && <ValidationReview id={selected} onClose={() => setSelected(null)} />}
      {retiring && <RetireTemplate detail={detail} onClose={() => setRetiring(false)} />}
    </section>
  );
}
function ValidationReview({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["templates", "validation", id],
    queryFn: async () => unwrap(await getTemplateValidation({ data: { id } })),
    refetchInterval: (query) =>
      query.state.data?.operation &&
      ["Pending", "Running"].includes(query.state.data.operation.state)
        ? 2000
        : false,
  });
  const detail = query.data,
    [fixtureId, setFixtureId] = useState<string | null>(null),
    [visual, setVisual] = useState(false);
  const approve = useTemplateCommand(
    async (input: Omit<ApproveTemplateRequest, "idempotencyKey">, key) =>
      unwrap(await approveTemplateRevision({ data: { ...input, idempotencyKey: key } })),
  );
  const cancel = useMutation({
    mutationFn: async () => {
      if (!detail?.operation) throw Error("Missing operation");
      return unwrap(
        await cancelDocumentOperation({
          data: {
            operationId: detail.operation.id,
            idempotencyKey: `cancel-template-${detail.operation.id}`,
          },
        }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["templates"] }),
  });
  const fixture =
    detail?.fixtures.find((item) => item.fixtureId === fixtureId) ?? detail?.fixtures[0];
  const report = detail?.validation.report;
  const active = detail?.operation && ["Pending", "Running"].includes(detail.operation.state);
  const eligible =
    detail?.template.revision.state === "Validated" &&
    detail.template.revision.validationId === id &&
    report?.passed;
  const path = fixture ? `/api/template-artifacts/${id}/${fixture.fixtureId}` : null;
  return (
    <EvidenceDialog
      title="Review sample PDFs"
      description="Review this template revision, every required sample PDF, extracted text, and test results before approving."
      onClose={onClose}
      pending={approve.isPending || cancel.isPending}
      className="sm:max-w-[min(1280px,calc(100vw-3rem))]"
    >
      <Failure error={query.error} />
      <Failure error={approve.error} />
      <Failure error={cancel.error} />
      {detail && (
        <div className="space-y-5">
          <div className="flex flex-wrap justify-between gap-3">
            <p role="status" className="text-sm">
              {detail.operation?.stage}
            </p>
            {active && (
              <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel validation
              </Button>
            )}
          </div>
          {detail.operation?.failure && (
            <p role="alert" className="text-sm text-destructive">
              {detail.operation.failure}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {detail.fixtures.map((entry) => (
              <Button
                key={entry.fixtureId}
                size="sm"
                variant={entry.fixtureId === fixture?.fixtureId ? "secondary" : "outline"}
                onClick={() => setFixtureId(entry.fixtureId)}
              >
                {entry.result.name} · {entry.result.passed ? "Passed" : "Failed"}
              </Button>
            ))}
          </div>
          {fixture && (
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 rounded-sm border bg-muted/30 p-4">
                {path && fixture.result.artifacts ? (
                  <PdfPreview url={`${path}/pdf`} />
                ) : (
                  <p className="text-sm">This fixture has no rendered PDF.</p>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                <h3 className="font-sans text-sm font-semibold">{fixture.result.name}</h3>
                {fixture.result.diagnostic && (
                  <p className="text-sm text-destructive">{fixture.result.diagnostic}</p>
                )}
                {path && fixture.result.artifacts && (
                  <div className="flex flex-wrap gap-2">
                    {(["pdf", "tex", "text", "report"] as const).map((kind) => (
                      <Button key={kind} asChild size="sm" variant="outline">
                        <a href={`${path}/${kind}?download`}>
                          {kind === "tex"
                            ? "LaTeX"
                            : kind === "text"
                              ? "Text"
                              : kind === "report"
                                ? "Report"
                                : "PDF"}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
                {fixture.result.validation && (
                  <>
                    <CodePayload
                      label="Extracted text"
                      value={fixture.result.validation.extractedText}
                    />
                    <CodePayload label="Text validation report" value={fixture.result.validation} />
                  </>
                )}
                <CodePayload
                  label="Render identities and resources"
                  value={{
                    first: fixture.result.firstFingerprint,
                    second: fixture.result.secondFingerprint,
                    resources: fixture.result.artifacts?.resources,
                    renderer: fixture.result.artifacts?.rendererVersion,
                  }}
                />
              </div>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Complete validation identity
            </summary>
            <div className="mt-4">
              <CodePayload
                label="Exact report and graph"
                value={{
                  graphDigest: detail.validation.graphDigest,
                  fixtureSetDigest: detail.validation.fixtureSetDigest,
                  renderer: detail.validation.renderer,
                  validator: detail.validation.validator,
                  reportDigest: detail.validation.reportDigest,
                  validationId: id,
                  revisionId: detail.template.revision.id,
                }}
              />
            </div>
          </details>
          {eligible && (
            <div className="space-y-4 border-t pt-5">
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={visual}
                  onChange={(event) => setVisual(event.target.checked)}
                />
                I reviewed every required sample PDF and its layout warnings for this template
                revision and validation report.
              </label>
              <Button
                disabled={!visual || approve.isPending}
                onClick={() => {
                  if (detail.validation.reportDigest)
                    approve.mutate({
                      revisionId: detail.template.revision.id,
                      revision: detail.template.revision.reviewRevision,
                      validationId: id,
                      reportDigest: detail.validation.reportDigest,
                      visualReview: true,
                    });
                }}
              >
                Approve this template revision
              </Button>
            </div>
          )}
          {!active && !eligible && (
            <p className="text-sm text-muted-foreground">
              {detail.template.revision.state === "Approved"
                ? "This template revision is approved."
                : detail.template.revision.state === "Retired"
                  ? "This template revision is retired. Its validation report remains available."
                  : "Approval requires the current complete successful report. Correct the Draft or retry an interrupted validation."}
            </p>
          )}
        </div>
      )}
    </EvidenceDialog>
  );
}
function RetireTemplate({ detail, onClose }: { detail: TemplateDetail; onClose: () => void }) {
  const [rationale, setRationale] = useState("");
  const retire = useTemplateCommand(
    async (input: Omit<RetireTemplateRequest, "idempotencyKey">, key) =>
      unwrap(await retireTemplateRevision({ data: { ...input, idempotencyKey: key } })),
    onClose,
  );
  return (
    <EvidenceDialog
      title="Retire template revision"
      description="Existing résumés and checkpoints keep this template revision. It will no longer be available for new selections."
      onClose={onClose}
      dirty={Boolean(rationale)}
      pending={retire.isPending}
    >
      <div className="space-y-5">
        <FormField label="Reason for retirement">
          <Textarea
            value={rationale}
            maxLength={4000}
            onChange={(event) => setRationale(event.target.value)}
          />
        </FormField>
        <Failure error={retire.error} />
        <Button
          disabled={!rationale.trim() || retire.isPending}
          onClick={() =>
            retire.mutate({
              revisionId: detail.revision.id,
              revision: detail.revision.reviewRevision,
              rationale,
            })
          }
        >
          Retire revision {detail.revision.version}
        </Button>
      </div>
    </EvidenceDialog>
  );
}
