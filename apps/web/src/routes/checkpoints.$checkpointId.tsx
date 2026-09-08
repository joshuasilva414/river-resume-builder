import type { AcknowledgeCheckpointRequest } from "@river/contracts";
import { ValidationReport } from "@river/contracts";
import { blockDefinitions } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  RENDERER_VERSION,
  SOURCE_RENDERER_VERSION,
} from "@river/templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { type ReactNode, useEffect, useState } from "react";
import { CheckpointHistory } from "~/components/composition/checkpoints";
import { EvidenceDialog, Failure, MaterialSummary, unwrap } from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { PdfPreview } from "~/components/pdf-preview";
import { SavedRefinements, SourceRefinements } from "~/components/refinement/launch";
import { StructuredReturn } from "~/components/refinement/structured-return";
import { TemplatePromotion } from "~/components/refinement/template-promotion";
import { CheckpointScoring, ScoringHistory } from "~/components/scoring/launch";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import {
  authorizeCheckpointExport,
  getCheckpoint,
  refreshCheckpointReview,
  retryCheckpointRender,
  saveCheckpointAcknowledgments,
} from "~/server/checkpoint-functions";
import { cancelDocumentOperation, getSession } from "~/server/functions";

export const Route = createFileRoute("/checkpoints/$checkpointId")({
  validateSearch: (search: Record<string, unknown>): { scores?: true } =>
    search.scores === true || search.scores === "true" ? { scores: true } : {},
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: CheckpointPage,
});
type Detail = Extract<Awaited<ReturnType<typeof getCheckpoint>>, { ok: true }>["value"];
function CheckpointPage() {
  const session = Route.useRouteContext(),
    { checkpointId } = Route.useParams();
  const result = useQuery({
    queryKey: ["checkpoints", checkpointId],
    queryFn: async () => unwrap(await getCheckpoint({ data: { id: checkpointId } })),
    refetchInterval: (query) =>
      query.state.data?.operation &&
      ["Pending", "Running"].includes(query.state.data.operation.state)
        ? 1500
        : false,
  });
  return (
    <WorkspaceShell {...session} contained>
      <Failure error={result.error} />
      {result.isPending && (
        <p className="p-8" role="status">
          Loading saved version…
        </p>
      )}
      {result.error && <Button onClick={() => void result.refetch()}>Retry saved version</Button>}
      {result.data && <Review key={checkpointId} detail={result.data} />}
    </WorkspaceShell>
  );
}
function Review({ detail }: { detail: Detail }) {
  const client = useQueryClient(),
    { checkpoint, state, report, operation, exported } = detail;
  const [scores, setScores] = useState(false);
  const searchScores = Route.useSearch().scores;
  const [tab, setTab] = useState(searchScores ? "scores" : "document");
  useEffect(() => {
    if (searchScores) setTab("scores");
  }, [searchScores]);
  const [history, setHistory] = useState(false),
    [refinements, setRefinements] = useState(false),
    [structuredReturn, setStructuredReturn] = useState(false),
    [templatePromotion, setTemplatePromotion] = useState(false),
    [acknowledge, setAcknowledge] = useState(false),
    [search, setSearch] = useState("");
  const [request, setRequest] = useState<{
    kind: "review" | "export" | "retry" | "cancel";
    operationId: string | null;
    id: string;
    revision: number;
    idempotencyKey: string;
    reportId: string;
    digest: string;
  } | null>(null);
  const action = useMutation({
    mutationFn: async (kind: "review" | "export" | "retry" | "cancel") => {
      const payload = request ?? {
        kind,
        operationId: operation?.id ?? null,
        id: checkpoint.id,
        revision: state.revision,
        reportId: report.id,
        digest: report.digest,
        idempotencyKey: crypto.randomUUID(),
      };
      setRequest(payload);
      if (payload.kind === "review")
        return unwrap(await refreshCheckpointReview({ data: payload }));
      if (payload.kind === "export")
        return unwrap(await authorizeCheckpointExport({ data: payload }));
      if (payload.kind === "retry") return unwrap(await retryCheckpointRender({ data: payload }));
      if (!payload.operationId) throw new Error("Document operation unavailable.");
      await cancelDocumentOperation({
        data: { operationId: payload.operationId, idempotencyKey: payload.idempotencyKey },
      }).then(unwrap);
      return null;
    },
    onSuccess: () => {
      setRequest(null);
      void client.invalidateQueries({ queryKey: ["checkpoints"] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["checkpoints", checkpoint.id] });
    },
  });
  const reportQuery = useQuery({
    queryKey: ["artifact-report", operation?.id],
    enabled: !!operation?.artifacts,
    queryFn: async () => {
      const response = await fetch(`/api/artifacts/${operation?.id}/report`);
      if (!response.ok)
        throw new Error("The document checks are unavailable. Retry from this saved version.");
      return Schema.decodeUnknownSync(ValidationReport)(await response.json());
    },
  });
  const validation = reportQuery.data,
    active = !!operation && ["Pending", "Running"].includes(operation.state);
  const acknowledged = report.issues.filter((issue) =>
    detail.acknowledgments.some((ack) => ack.issueId === issue.id),
  ).length;
  const matchingRuntime =
    operation?.artifacts?.rendererVersion ===
      (detail.source
        ? SOURCE_RENDERER_VERSION
        : checkpoint.templateGraph
          ? CUSTOM_RENDERER_VERSION
          : RENDERER_VERSION) &&
    operation?.artifacts?.templateIdentity === checkpoint.templateIdentity;
  const ready =
    operation?.state === "Succeeded" &&
    operation.artifacts?.validationPassed === true &&
    matchingRuntime &&
    acknowledged === report.issues.length;
  const text = validation?.extractedText ?? "";
  const matches = search
    ? text.toLocaleLowerCase().split(search.toLocaleLowerCase()).length - 1
    : 0;
  return (
    <>
      <header className="shrink-0 space-y-3 border-b px-5 py-7 md:px-8">
        <p className="eyebrow">{detail.posting?.details.role} / Review & export · Saved version</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-heading">Review your résumé before export.</h1>
          <Link
            className="text-sm text-primary underline"
            to="/resumes/$resumeId"
            params={{ resumeId: checkpoint.draftId }}
          >
            Back to current résumé
          </Link>
          <Button variant="outline" onClick={() => setHistory(true)}>
            History
          </Button>
          <Button variant="outline" onClick={() => setRefinements(true)}>
            Refine final document
          </Button>
          <Button variant="outline" onClick={() => setScores(true)}>
            Score résumé
          </Button>
          {detail.source && (
            <>
              <Button variant="outline" onClick={() => setStructuredReturn(true)}>
                Return to structured editing
              </Button>
              <Button variant="outline" onClick={() => setTemplatePromotion(true)}>
                Promote a layout idea
              </Button>
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {checkpoint.label ? `${checkpoint.label} · ` : ""}
          {checkpoint.data.name} · Saved {new Date(checkpoint.createdAt).toLocaleString()}
        </p>
      </header>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-5 mt-4 w-fit">
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="refinements">Refinements</TabsTrigger>
        </TabsList>
        <TabsContent value="document" className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-0 flex-1 xl:grid-cols-[1.05fr_1fr]">
            <section className="min-w-0 space-y-5 border-b p-5 md:p-7 xl:overflow-y-auto xl:border-r xl:border-b-0">
              <h2 className="font-editorial text-2xl font-medium">
                Check the document before exporting.
              </h2>
              <p className="text-sm text-muted-foreground">
                The PDF and text below belong to this saved version. Later edits do not change these
                files.
              </p>
              <div className="divide-y">
                <Check
                  label="PDF prepared"
                  status={operation?.artifacts ? "Passed" : active ? "Pending" : "Blocked"}
                />
                <Check
                  label="Template checks"
                  status={matchingRuntime ? "Passed" : active ? "Pending" : "Not validated"}
                />
                <Check
                  label="Wording preserved"
                  status={validation ? (validation.passed ? "Passed" : "Blocked") : "Pending"}
                />
                <Check
                  label="Saved review"
                  status={
                    report.issues.length === 0
                      ? "No additional review needed"
                      : `${acknowledged} of ${report.issues.length} reviewed`
                  }
                />
              </div>
              <Failure error={action.error} />
              {request && action.error && (
                <div className="flex gap-3">
                  <Button disabled={action.isPending} onClick={() => action.mutate(request.kind)}>
                    Retry {request.kind}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRequest(null);
                      action.reset();
                    }}
                  >
                    Review current status
                  </Button>
                </div>
              )}
              {detail.previousReport && !exported && (
                <div
                  className="space-y-3 border-l-2 border-warning bg-warning/10 p-4"
                  role="status"
                >
                  <h3 className="font-semibold">Evidence changed during review</h3>
                  <p className="text-sm">
                    Review the updated items before exporting. Your previous review remains in the
                    history.
                  </p>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Compare previous and current reports
                    </summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {[detail.previousReport, report].map((value) => (
                        <div key={value.id} className="space-y-2">
                          <p className="eyebrow">
                            {value.id === report.id ? "Current" : "Previous"} · {value.id.slice(-8)}
                          </p>
                          {value.issues.length === 0 && <p>No evidence issues.</p>}
                          {value.issues.map((issue) => (
                            <div key={issue.id} className="border-t py-2 text-sm">
                              <strong>{issue.kind}</strong>
                              <p className="whitespace-pre-wrap">{issue.wording}</p>
                              <p>{issue.rationale}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
              {validation?.warnings.map((warning) => (
                <p key={warning} className="border-l-2 border-warning bg-warning/10 p-4 text-sm">
                  Layout advisory: {warning}
                </p>
              ))}
              {operation && (
                <div className="space-y-3">
                  <p role="status" className="text-sm">
                    {operation.stage} · Attempt {state.attempts} of 3
                  </p>
                  {operation.failure && (
                    <p className="text-sm text-destructive">{operation.failure}</p>
                  )}
                  {active && (
                    <Button
                      variant="outline"
                      disabled={action.isPending || !!request}
                      onClick={() => action.mutate("cancel")}
                    >
                      Cancel document preparation
                    </Button>
                  )}
                  {!detail.source &&
                    !active &&
                    !exported &&
                    ["Failed", "Cancelled"].includes(operation.state) &&
                    operation.artifacts?.validationPassed !== false && (
                      <Button
                        variant="outline"
                        disabled={action.isPending || !!request || state.attempts >= 3}
                        onClick={() => action.mutate("retry")}
                      >
                        Retry document preparation
                      </Button>
                    )}
                </div>
              )}
              {!exported && (
                <div className="space-y-3">
                  {report.issues.length > 0 && (
                    <Button variant="outline" onClick={() => setAcknowledge(true)}>
                      Review {report.issues.length} evidence issues
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={action.isPending || !!request}
                      onClick={() => action.mutate("review")}
                    >
                      Refresh review
                    </Button>
                    <Button
                      disabled={!ready || action.isPending || !!request}
                      onClick={() => action.mutate("export")}
                    >
                      {action.isPending ? "Saving review…" : "Export résumé files"}
                    </Button>
                  </div>
                  {!ready && (
                    <p className="text-xs text-muted-foreground">
                      {acknowledged < report.issues.length
                        ? "Complete the document checks and review the saved items before exporting."
                        : "Export becomes available when the document checks pass."}
                    </p>
                  )}
                </div>
              )}
              {exported && (
                <div className="space-y-4 border-t pt-5">
                  <h3 className="font-editorial text-2xl font-medium">Export complete</h3>
                  <p className="text-sm">
                    {new Date(exported.createdAt).toLocaleString()} · Your saved version and its
                    review remain available.
                  </p>
                  <a
                    className="inline-flex rounded-sm bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                    href={`/api/artifacts/${exported.operationId}/pdf?download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF
                  </a>
                  <details>
                    <summary className="cursor-pointer py-3 text-sm text-primary">
                      More formats
                    </summary>
                    <div className="flex flex-wrap gap-4">
                      {([["text", "Plain text (.txt)"]] as const).map(([kind, label]) => (
                        <a
                          key={kind}
                          className="py-3 text-sm text-primary underline"
                          href={`/api/artifacts/${exported.operationId}/${kind}?download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {label}
                        </a>
                      ))}
                    </div>
                  </details>
                  <p className="text-xs text-muted-foreground">
                    If a download is interrupted, use the same file link again. Your retained export
                    stays available.
                  </p>
                </div>
              )}
              {detail.source && (
                <section className="space-y-3 border-t pt-5">
                  <h3 className="text-xl">Refined document</h3>
                  <p className="text-sm">
                    This document includes reviewed layout or wording changes. You can still return
                    to its earlier editor version.
                  </p>
                </section>
              )}
            </section>
            <aside className="min-w-0 space-y-4 bg-muted/40 p-5 md:p-7 xl:overflow-y-auto">
              <p className="eyebrow">{checkpoint.label ?? "Saved version"} · Document preview</p>
              {operation?.artifacts ? (
                <Tabs defaultValue="pdf">
                  <TabsList>
                    <TabsTrigger value="pdf">PDF</TabsTrigger>
                    <TabsTrigger value="text">Extracted text</TabsTrigger>
                    <TabsTrigger value="report">Text checks</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pdf">
                    <PdfPreview url={`/api/artifacts/${operation.id}/pdf`} />
                  </TabsContent>
                  <TabsContent value="text" className="space-y-4">
                    <Failure error={reportQuery.error} />
                    {reportQuery.error && (
                      <Button onClick={() => void reportQuery.refetch()}>Retry report</Button>
                    )}
                    <label className="flex flex-col gap-2 text-sm">
                      Find in extracted text
                      <input
                        className="rounded-sm border bg-background p-2"
                        value={search}
                        maxLength={200}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    {search && (
                      <p role="status" className="text-xs">
                        {matches} matches · First 200 highlighted
                      </p>
                    )}
                    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-sm border bg-background p-4 font-mono text-xs leading-5">
                      {text
                        ? highlightedText(text, search)
                        : reportQuery.isPending
                          ? "Loading text…"
                          : "No text extracted."}
                    </pre>
                  </TabsContent>
                  <TabsContent value="report" className="space-y-4">
                    <Failure error={reportQuery.error} />
                    {reportQuery.error && (
                      <Button onClick={() => void reportQuery.refetch()}>Retry report</Button>
                    )}
                    {validation && (
                      <>
                        <p className={validation.passed ? "text-approved" : "text-destructive"}>
                          {validation.passed
                            ? "Text validation passed"
                            : "Text integrity blocks export"}
                        </p>
                        {validation.checks && (
                          <div>
                            <Check
                              label="All wording present"
                              status={validation.checks.completeness ? "Passed" : "Blocked"}
                            />
                            <Check
                              label="Repeated wording preserved"
                              status={validation.checks.multiplicity ? "Passed" : "Blocked"}
                            />
                            <Check
                              label="Reading order"
                              status={validation.checks.readingOrder ? "Passed" : "Blocked"}
                            />
                          </div>
                        )}
                        <p className="text-xs">
                          {validation.pageCount ?? "Unknown"}{" "}
                          {validation.pageCount === 1 ? "page" : "pages"}
                        </p>
                        {validation.firstDifference && (
                          <div className="space-y-2 border-l-2 border-destructive p-4">
                            <p className="text-sm font-semibold">First text difference</p>
                            <p className="whitespace-pre-wrap text-sm">
                              {validation.firstDifference.expectedText}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {active
                    ? "Your document is being prepared. Its files will appear here when ready."
                    : "Document preparation has not completed. Your saved résumé is preserved."}
                </p>
              )}
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="scores" className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          <ScoringHistory checkpointId={checkpoint.id} draftId={checkpoint.draftId} />
        </TabsContent>
        <TabsContent value="refinements" className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          <SavedRefinements checkpointId={checkpoint.id} />
        </TabsContent>
      </Tabs>
      {refinements && <SourceRefinements detail={detail} onClose={() => setRefinements(false)} />}
      {scores && (
        <CheckpointScoring
          checkpointId={checkpoint.id}
          onStarted={() => setTab("scores")}
          onClose={() => setScores(false)}
        />
      )}
      {structuredReturn && (
        <StructuredReturn checkpointId={checkpoint.id} onClose={() => setStructuredReturn(false)} />
      )}
      {templatePromotion && (
        <TemplatePromotion
          checkpointId={checkpoint.id}
          onClose={() => setTemplatePromotion(false)}
        />
      )}
      {history && (
        <CheckpointHistory draftId={checkpoint.draftId} onClose={() => setHistory(false)} />
      )}
      {acknowledge && <Acknowledgments detail={detail} onClose={() => setAcknowledge(false)} />}
    </>
  );
}
function highlightedText(text: string, query: string): ReactNode {
  if (!query) return text;
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const parts: ReactNode[] = [];
  let offset = 0,
    count = 0;
  for (const match of text.matchAll(pattern)) {
    if (++count > 200) break;
    parts.push(text.slice(offset, match.index));
    parts.push(
      <mark key={match.index} className="bg-warning/40 text-foreground">
        {match[0]}
      </mark>,
    );
    offset = match.index + match[0].length;
  }
  parts.push(text.slice(offset));
  return parts;
}
function Check({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-5 py-4">
      <p className="text-sm font-semibold">{label}</p>
      <p
        className={`shrink-0 text-right text-xs ${status === "Passed" ? "text-approved" : "text-muted-foreground"}`}
      >
        {status}
      </p>
    </div>
  );
}
function issueLocation(detail: Detail, locator: string) {
  const [sectionId, blockId, fieldKey] = locator.split("/");
  const section = detail.checkpoint.data.sections.find((section) => section.id === sectionId);
  const block = section?.blocks.find((block) => block.id === blockId);
  if (!section || !block) return "Saved wording";
  return `${section.heading || blockDefinitions[section.type].label} / ${blockDefinitions[block.type].fields.find((field) => field.key === fieldKey)?.label ?? fieldKey}`;
}
function Acknowledgments({ detail: current, onClose }: { detail: Detail; onClose: () => void }) {
  const [detail] = useState(current);
  const client = useQueryClient(),
    [selected, setSelected] = useState(() => detail.acknowledgments.map((ack) => ack.issueId)),
    [request, setRequest] = useState<AcknowledgeCheckpointRequest | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const payload = request ?? {
        id: detail.checkpoint.id,
        revision: detail.state.revision,
        reportId: detail.report.id,
        digest: detail.report.digest,
        issueIds: selected,
        idempotencyKey: crypto.randomUUID(),
      };
      setRequest(payload);
      return unwrap(await saveCheckpointAcknowledgments({ data: payload }));
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["checkpoints"] });
      onClose();
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["checkpoints", detail.checkpoint.id] });
    },
  });
  return (
    <EvidenceDialog
      title="Review saved evidence items"
      description="Confirm that you have reviewed the items shown below for this saved résumé."
      onClose={onClose}
      dirty={selected.some((id) => !detail.acknowledgments.some((ack) => ack.issueId === id))}
      pending={save.isPending}
      wide
    >
      <div className="space-y-4">
        {detail.report.issues.map((issue) => {
          const captured = detail.checkpoint.evidence.find(
              (entry) => entry.claimId === issue.claimId && entry.revisionId === issue.revisionId,
            ),
            saved = detail.acknowledgments.some((ack) => ack.issueId === issue.id);
          return (
            <article key={issue.id} className="space-y-3 rounded-sm border p-4">
              <p className="eyebrow break-all">
                {issue.kind} · {issueLocation(detail, issue.locator)}
              </p>
              <p className="whitespace-pre-wrap">{issue.wording}</p>
              <p className="text-sm text-muted-foreground">{issue.rationale}</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  className="size-5 shrink-0 accent-primary"
                  type="checkbox"
                  aria-label={`Confirm review of ${issue.kind} for ${issue.wording}`}
                  checked={selected.includes(issue.id)}
                  disabled={saved || !!request || save.isPending}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, issue.id]
                        : selected.filter((id) => id !== issue.id),
                    )
                  }
                />
                I have reviewed this {issue.kind.toLowerCase()} issue.{saved ? " Saved." : ""}
              </label>
              {captured && (
                <details>
                  <summary className="cursor-pointer text-sm text-primary">
                    Inspect captured assertion, citations and context
                  </summary>
                  <MaterialSummary material={captured.material} contexts={captured.contexts} />
                  <EvidenceLinks
                    value={[{ claimId: captured.claimId, revisionId: captured.revisionId }]}
                  />
                </details>
              )}
            </article>
          );
        })}
      </div>
      <Failure error={save.error} />
      <div className="sticky bottom-0 mt-5 flex flex-wrap items-center justify-between gap-4 border-t bg-background py-4">
        <p role="status" className="text-sm">
          {selected.length} of {detail.report.issues.length} items reviewed
        </p>
        <Button disabled={save.isPending || selected.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? "Saving review…" : save.error ? "Retry saving review" : "Save review"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your review is saved with this version. Document checks must still pass before export.
      </p>
    </EvidenceDialog>
  );
}
