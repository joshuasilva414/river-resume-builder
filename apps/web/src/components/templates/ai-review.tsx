import type {
  ArtifactManifest,
  RetryTemplateAiRequest,
  ReviewTemplateAiRequest,
} from "@river/contracts";
import { templateFixtures } from "@river/templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cancelDocumentOperation } from "~/server/functions";
import {
  decideTemplateAi,
  getTemplateAiTask,
  retryTemplateAiTask,
} from "~/server/template-ai-functions";
import { CodePayload, scopeLabel, useTemplateCommand } from "./shared";

type Detail = Extract<Awaited<ReturnType<typeof getTemplateAiTask>>, { ok: true }>["value"];
export function TemplateAiReview({
  id,
  onClose,
  onDraft,
}: {
  id: string;
  onClose: () => void;
  onDraft: (id: string) => void;
}) {
  return (
    <EvidenceDialog
      title="Review template proposal"
      description="Review the sample PDF and layout warnings before saving this template."
      onClose={onClose}
      className="sm:max-w-[min(1280px,calc(100vw-3rem))]"
    >
      <TemplateAiInspection id={id} onDraft={onDraft} />
    </EvidenceDialog>
  );
}
export function TemplateAiInspection({
  id,
  onDraft,
  onAccepted,
}: {
  id: string;
  onDraft: (id: string) => void;
  onAccepted?: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: ["templates", "ai", "detail", id],
    queryFn: async () => unwrap(await getTemplateAiTask({ data: { id } })),
    refetchInterval: (data) =>
      data.state.data?.operation && ["Pending", "Running"].includes(data.state.data.operation.state)
        ? 2000
        : 30000,
  });
  return (
    <>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading saved proposal…</p>}
      {query.data && (
        <TemplateAiReviewBody
          key={id}
          current={query.data}
          onDraft={onDraft}
          onAccepted={onAccepted}
        />
      )}
    </>
  );
}
function TemplateAiReviewBody({
  current,
  onDraft,
  onAccepted,
}: {
  current: Detail;
  onDraft: (id: string) => void;
  onAccepted?: ((id: string) => void) | undefined;
}) {
  const client = useQueryClient();
  // A completed preview stays pinned while it is being reviewed; polling only reports changes.
  const [reviewed, setReviewed] = useState<Detail | null>(() =>
    current.proposal?.previewArtifacts ? current : null,
  );
  const rejected = current.proposal?.state === "Rejected",
    displayed = rejected ? current : (reviewed ?? current),
    proposal = displayed.proposal,
    task = current.task,
    active = Boolean(current.operation && ["Pending", "Running"].includes(current.operation.state)),
    pending = current.proposal?.state === "Pending",
    artifacts = proposal?.previewArtifacts,
    expired = Boolean(artifacts && (artifacts.expiresAt ?? 0) <= Date.now()),
    replaced = Boolean(
      reviewed &&
        (current.proposal?.revision !== reviewed.proposal?.revision ||
          current.proposal?.previewOperationId !== reviewed.proposal?.previewOperationId),
    ),
    blocked =
      !pending ||
      !reviewed ||
      replaced ||
      expired ||
      !artifacts?.validationPassed ||
      current.staleReasons.length > 0;
  useEffect(() => {
    if (rejected) setReviewed(null);
  }, [rejected]);
  const decision = useTemplateCommand(
    async (input: Omit<ReviewTemplateAiRequest, "idempotencyKey">, key) =>
      unwrap(await decideTemplateAi({ data: { ...input, idempotencyKey: key } })),
    (result) => {
      setReviewed(null);
      client.removeQueries({ queryKey: ["templates", "ai-artifact", task.id] });
      if (result.revisionId) (onAccepted ?? onDraft)(result.revisionId);
    },
  );
  const retry = useTemplateCommand(
    async (input: Omit<RetryTemplateAiRequest, "idempotencyKey">, key) =>
      unwrap(await retryTemplateAiTask({ data: { ...input, idempotencyKey: key } })),
    () => setReviewed(null),
  );
  const cancel = useMutation({
    mutationFn: async () =>
      unwrap(
        await cancelDocumentOperation({
          data: { id: task.latestOperationId, idempotencyKey: crypto.randomUUID() },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["templates", "ai"] }),
  });
  const currentExpired = Boolean(
    current.proposal?.previewArtifacts?.validationPassed &&
      (current.proposal.previewArtifacts.expiresAt ?? 0) <= Date.now(),
  );
  const retryAllowed =
    !active &&
    current.staleReasons.length === 0 &&
    (pending
      ? current.previewConfigured &&
        (currentExpired ||
          ((current.proposal?.previewAttempts ?? 3) < 3 &&
            ["Failed", "Cancelled"].includes(current.operation?.state ?? "")))
      : !current.proposal &&
        current.configured &&
        task.attempts < 3 &&
        ["Failed", "Cancelled"].includes(current.operation?.state ?? ""));
  const path =
    proposal?.previewOperationId && artifacts && !expired && !rejected
      ? `/api/template-proposals/${task.id}/${proposal.previewOperationId}`
      : null;
  const busy = decision.isPending || retry.isPending || cancel.isPending;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h2 className="break-words font-editorial text-[28px]">{task.name}</h2>
          <p className="text-base md:text-sm">
            {scopeLabel(task.input.scope)} · {new Date(task.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline">{current.proposal?.state ?? "Pending generation"}</Badge>
      </div>
      <div className="space-y-3 rounded-sm border p-4">
        <p role="status">
          {rejected
            ? "Proposal rejected"
            : current.proposal?.state === "Accepted"
              ? "Saved as an immutable Draft"
              : current.operation?.stage}
        </p>
        <p className="text-base md:text-sm text-muted-foreground">
          Generation attempt {task.attempts} of 3
          {current.proposal
            ? ` · Preview attempt ${current.proposal.previewAttempts} of 3 in this cycle`
            : ""}
        </p>
        {current.operation?.failure && (
          <p role="alert" className="text-base md:text-sm text-destructive">
            {current.operation.failure}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {active && (
            <Button variant="outline" disabled={busy} onClick={() => cancel.mutate()}>
              {cancel.isPending ? "Cancel requested…" : "Cancel operation"}
            </Button>
          )}
          {retryAllowed && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => retry.mutate({ id: task.id, revision: task.revision })}
            >
              {pending
                ? currentExpired
                  ? "Render fresh preview"
                  : "Retry saved candidate preview"
                : "Retry generation"}
            </Button>
          )}
        </div>
        {currentExpired && pending && (
          <p className="text-base md:text-sm">
            The preview expired after seven days. A fresh preview starts a new three-attempt cycle
            for this saved candidate.
          </p>
        )}
        {pending &&
          !active &&
          !retryAllowed &&
          !current.proposal?.previewArtifacts?.validationPassed && (
            <p className="text-base md:text-sm">
              Preview retry is unavailable. Inspect the remaining attempts and stale-input findings.
              You can reject this proposal and continue manually.
            </p>
          )}
      </div>
      <Failure error={decision.error} />
      <Failure error={retry.error} />
      <Failure error={cancel.error} />
      {current.staleReasons.length > 0 && (
        <Alert>
          <AlertDescription>
            <p className="font-semibold">The captured inputs changed</p>
            <ul className="mt-2 list-disc pl-5">
              {current.staleReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-2">
              Start a new proposal from the current template to incorporate those changes.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {replaced && pending && (
        <Alert>
          <AlertDescription>
            A newer preview or review state is available. The displayed comparison remains pinned.
            Review the current preview before accepting.
          </AlertDescription>
        </Alert>
      )}
      {pending && current.proposal?.previewArtifacts && (!reviewed || replaced) && (
        <Button variant="outline" disabled={busy} onClick={() => setReviewed(current)}>
          Review current preview
        </Button>
      )}

      {rejected ? (
        <p className="rounded-sm border p-5">
          The generated candidate was discarded. Its preview files are no longer available. Your
          brief and original base remain saved.
        </p>
      ) : (
        proposal?.payload && (
          <>
            <p className="whitespace-pre-wrap text-base leading-7">
              {proposal.payload.explanation}
            </p>
            <Tabs defaultValue="preview" className="min-w-0">
              <TabsList
                className="flex max-w-full flex-wrap justify-start gap-y-3 group-data-[orientation=horizontal]/tabs:h-auto [&>[data-slot=tabs-trigger]]:h-9"
                variant="line"
              >
                <TabsTrigger value="preview">Sample preview</TabsTrigger>
              </TabsList>
              <TabsContent value="preview">
                <div className="min-w-0 space-y-4 pt-3">
                  <h3 className="font-semibold">
                    {task.input.fixtureSet.fixtures[0].name} · Candidate preview
                  </h3>
                  <p className="text-base md:text-sm text-muted-foreground">
                    This sample includes every résumé section. Saved templates receive a complete
                    set of checks.
                  </p>
                  {path && artifacts ? (
                    <CandidateArtifacts path={path} taskId={task.id} artifacts={artifacts} />
                  ) : (
                    <p className="rounded-sm border p-5">
                      {expired
                        ? "These preview files expired. The complete candidate remains available for inspection."
                        : "The candidate is saved. A complete preview is required before acceptance."}
                    </p>
                  )}
                  {artifacts && (
                    <p className="text-base md:text-sm">
                      Required validation {artifacts.validationPassed ? "passed" : "failed"}.
                      Preview expires {new Date(artifacts.expiresAt ?? 0).toLocaleString()}.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )
      )}
      {pending && (
        <div className="space-y-4 border-t pt-5">
          <p className="text-base md:text-sm text-muted-foreground">
            Accepting creates a new immutable Draft. It still needs {templateFixtures.length} sample
            PDFs checked automatically, followed by your review.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={blocked || busy}
              onClick={() => {
                if (proposal)
                  decision.mutate({
                    id: proposal.id,
                    revision: proposal.revision,
                    digest: proposal.digest,
                    previewOperationId: proposal.previewOperationId,
                    previewDigest: proposal.previewDigest,
                    decision: "Accepted",
                  });
              }}
            >
              Accept as Draft
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const p = current.proposal;
                if (p)
                  decision.mutate({
                    id: p.id,
                    revision: p.revision,
                    digest: p.digest,
                    previewOperationId: p.previewOperationId,
                    previewDigest: p.previewDigest,
                    decision: "Rejected",
                  });
              }}
            >
              Reject proposal
            </Button>
          </div>
          {blocked && (
            <p className="text-base md:text-sm text-muted-foreground">
              Acceptance requires the current passing, unexpired preview and unchanged captured
              inputs.
            </p>
          )}
        </div>
      )}
      {current.proposal?.state === "Accepted" && current.proposal.resultRevisionId && (
        <div className="space-y-3 border-t pt-5">
          <p>
            The exact candidate was saved as a Draft. Open it to validate, edit, or start another
            refinement.
          </p>
          <Button
            onClick={() => {
              if (current.proposal?.resultRevisionId) onDraft(current.proposal.resultRevisionId);
            }}
          >
            Open resulting Draft
          </Button>
        </div>
      )}
      {rejected && (
        <CodePayload
          label="Retained decision identity"
          value={{
            id: current.proposal?.id,
            digest: current.proposal?.digest,
            reviewedAt: current.proposal?.reviewedAt,
          }}
        />
      )}
    </div>
  );
}
function CandidateArtifacts({
  path,
  taskId,
  artifacts,
}: {
  path: string;
  taskId: string;
  artifacts: ArtifactManifest;
}) {
  const [tab, setTab] = useState("pdf");
  const query = useQuery({
    queryKey: ["templates", "ai-artifact", taskId, path],
    enabled: tab === "text",
    queryFn: async () => {
      const text = await fetch(`${path}/text`);
      if (!text.ok)
        throw Error(
          "The preview files are unavailable or expired. Refresh this task before accepting.",
        );
      return text.text();
    },
    staleTime: 0,
  });
  return (
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList variant="line">
        <TabsTrigger value="pdf">PDF</TabsTrigger>
        <TabsTrigger value="text">Extracted text</TabsTrigger>
        <TabsTrigger value="report">Checks</TabsTrigger>
      </TabsList>
      <Failure error={query.error} />
      <TabsContent value="pdf">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 rounded-sm border bg-muted/30 p-4">
            <PdfPreview url={`${path}/pdf`} />
          </div>
          <aside className="min-w-0 space-y-4 py-3">
            <h3 className="font-sans text-base font-semibold">Sample résumé</h3>
            <p className="text-base md:text-sm">Layout checks · Passed</p>
            <p className="text-base md:text-sm">
              Text integrity · {artifacts.validationPassed ? "Passed" : "Failed"}
            </p>
            <p className="text-base md:text-sm text-muted-foreground">
              Use the page and zoom controls to inspect the complete PDF. Review the extracted text
              and checks before accepting.
            </p>
          </aside>
        </div>
      </TabsContent>
      <TabsContent value="text">
        <p className="max-h-[440px] overflow-auto rounded-sm border p-4 text-sm whitespace-pre-wrap">
          {query.data ?? (query.isPending ? "Loading text…" : "Text unavailable.")}
        </p>
      </TabsContent>
      <TabsContent value="report">
        <div className="space-y-3 rounded-sm border p-4 text-sm">
          <p>Layout checks passed.</p>
          <p>
            {artifacts.validationPassed
              ? "Required text is present and in the expected order."
              : "Text checks failed. Review the sample before trying again."}
          </p>
          <p>Inspect the PDF for spacing, readability, and page breaks before saving.</p>
        </div>
      </TabsContent>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["pdf", "text"] as const).map((kind) => (
          <Button key={kind} variant="outline" size="sm" asChild>
            <a href={`${path}/${kind}?download`}>{kind === "text" ? "Text" : "PDF"}</a>
          </Button>
        ))}
      </div>
    </Tabs>
  );
}
