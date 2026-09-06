import type { RetrySourceRefinementRequest, ReviewSourceRefinementRequest } from "@river/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { getCheckpoint } from "~/server/checkpoint-functions";
import { cancelDocumentOperation } from "~/server/functions";
import {
  decideSourceRefinement,
  type getSourceRefinement,
  retrySourceRefinementTask,
} from "~/server/refinement-functions";
import { SourceComparisonViews } from "./comparison";
import { SourceRefinements } from "./launch";

type Detail = Extract<Awaited<ReturnType<typeof getSourceRefinement>>, { ok: true }>["value"];
type Action =
  | { type: "retry"; data: RetrySourceRefinementRequest }
  | { type: "review"; data: ReviewSourceRefinementRequest }
  | { type: "cancel"; data: { operationId: string; idempotencyKey: string } };
export function SourceReview({ detail }: { detail: Detail }) {
  const coverageId = useId();
  const { task, proposal: p, operation, acceptance, sourceReview } = detail;
  const client = useQueryClient(),
    request = useRef<Action | null>(null);
  const [coverage, setCoverage] = useState<string | null>(null),
    [launch, setLaunch] = useState(false),
    [captured, setCaptured] = useState(false);
  const key = ["source-refinements", "detail", task.id];
  const base = useQuery({
    queryKey: ["checkpoints", task.baseCheckpointId],
    enabled: launch,
    queryFn: async () => unwrap(await getCheckpoint({ data: { id: task.baseCheckpointId } })),
  });
  const action = useMutation({
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
    },
    mutationFn: async (next: Action) => {
      request.current ??= next;
      const current = request.current;
      if (current.type === "retry")
        return unwrap(await retrySourceRefinementTask({ data: current.data }));
      if (current.type === "review")
        return unwrap(await decideSourceRefinement({ data: current.data }));
      await cancelDocumentOperation({ data: current.data }).then(unwrap);
      return null;
    },
    onSuccess: async () => {
      const rejecting =
        request.current?.type === "review" && request.current.data.decision === "Rejected";
      request.current = null;
      setCoverage(null);
      if (rejecting)
        client.setQueryData<Detail>(key, (previous) =>
          previous
            ? {
                ...previous,
                sourceReview: null,
                proposal: previous.proposal
                  ? { ...previous.proposal, state: "Rejected", payload: null, comparison: null }
                  : null,
              }
            : previous,
        );
      await client.invalidateQueries({ queryKey: ["source-refinements"] });
      await client.invalidateQueries({ queryKey: ["checkpoints"] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const generating = !!operation && ["Pending", "Running"].includes(operation.state),
    publishing = !!acceptance && ["Pending", "Running"].includes(acceptance.state),
    accepted = p?.state === "Accepted",
    pending = p?.state === "Pending",
    expired = !!p?.previewArtifacts && (p.previewArtifacts.expiresAt ?? 0) <= Date.now(),
    stale = detail.staleReasons.length > 0,
    previewCurrent = p?.previewOperationId === task.latestOperationId,
    coverageKey = `${p?.candidateDigest}:${p?.previewOperationId}:${p?.reviewDigest}:${task.revision}:${detail.staleReasons.join("|")}`;
  const ready =
    pending &&
    previewCurrent &&
    operation?.state === "Succeeded" &&
    p.previewArtifacts?.validationPassed &&
    p.reviewDigest &&
    !expired &&
    !stale &&
    !publishing &&
    detail.runtimeConfigured;
  const artifactOperationId = accepted
    ? (acceptance?.id ?? null)
    : previewCurrent && !expired
      ? (p?.previewOperationId ?? null)
      : null;
  const busy = action.isPending || !!request.current;
  const retry = () =>
    action.mutate({
      type: "retry",
      data: { id: task.id, revision: task.revision, idempotencyKey: crypto.randomUUID() },
    });
  const decide = (decision: "Accepted" | "Rejected") => {
    if (!p) return;
    action.mutate({
      type: "review",
      data: {
        id: task.id,
        revision: task.revision,
        proposalId: p.id,
        candidateDigest: p.candidateDigest,
        previewOperationId: p.previewOperationId,
        reviewDigest: p.reviewDigest,
        decision,
        coverageConfirmed: coverage === coverageKey,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };
  return (
    <>
      <header className="space-y-4 border-b pb-6">
        <p className="eyebrow">Final-document refinement · {task.id.slice(-8)}</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="page-heading">Review proposed document changes.</h1>
          <Badge variant="outline">{p?.state ?? "No candidate yet"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            className="py-2 text-primary underline"
            to="/checkpoints/$checkpointId"
            params={{ checkpointId: task.baseCheckpointId }}
          >
            Review / export base checkpoint
          </Link>
          <Button variant="outline" onClick={() => setLaunch(true)}>
            Saved refinements / new request
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Compare the proposed wording, LaTeX, extracted text, and PDF. Accepting saves the changes
          as a new checkpoint.
        </p>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-6 rounded-md border bg-card p-5 md:p-6">
          <h2 className="text-[28px] leading-[34px]">Complete source comparison</h2>
          {sourceReview ? (
            <>
              {p?.comparison && (
                <p className="text-sm">
                  {p.comparison.layoutOnly
                    ? "Layout only · intended and extracted text unchanged"
                    : `${p.comparison.changedFields} changed or moved fields · ${p.comparison.extractedUnchanged ? "extracted text unchanged" : "extracted text changed"}`}
                </p>
              )}
              <SourceComparisonViews
                key={p?.reviewDigest ?? p?.candidateDigest}
                source={sourceReview.source}
                fields={sourceReview.fields}
                extracted={p?.comparison?.extracted ?? null}
                baseOperationId={task.input.checkpoint.operationId}
                candidateOperationId={artifactOperationId}
              />
            </>
          ) : (
            <p className="py-5 text-muted-foreground">
              {p?.state === "Rejected"
                ? "Rejected proposal payload and comparisons are removed. The decision and task identities remain."
                : "The complete source proposal will appear here after generation finishes."}
            </p>
          )}
        </section>
        <aside className="min-w-0 space-y-5 rounded-md border bg-card p-5 md:p-6">
          <h2 className="text-[28px] leading-[34px]">
            {accepted
              ? "Checkpoint saved"
              : publishing
                ? "Publishing checkpoint"
                : "Save the reviewed checkpoint"}
          </h2>
          <div className="space-y-2 text-sm" role="status">
            <p>{publishing || accepted ? acceptance?.stage : operation?.stage}</p>
            <p className="text-muted-foreground">
              Generation {task.generationAttempts}/3 · Preview {task.previewAttempts}/3
              {p?.acceptanceAttempts ? ` · Publication ${p.acceptanceAttempts}/3` : ""}
            </p>
          </div>
          {operation?.failure && (
            <p className="border-l-2 border-highlight bg-highlight/10 p-4 text-sm">
              {operation.failure}
            </p>
          )}
          {acceptance?.failure && !accepted && (
            <p className="border-l-2 border-highlight bg-highlight/10 p-4 text-sm">
              Publication: {acceptance.failure}
            </p>
          )}
          {expired && !accepted && (
            <p className="border-l-2 border-highlight bg-highlight/10 p-4 text-sm">
              Preview expired. Render the saved candidate within its remaining original budget, then
              review the new report.
            </p>
          )}
          {stale && !accepted && (
            <div className="space-y-2 border-l-2 border-highlight bg-highlight/10 p-4 text-sm">
              <p className="font-semibold">Captured inputs changed</p>
              {detail.staleReasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              <Button variant="outline" onClick={() => setCaptured(true)}>
                Compare captured / current
              </Button>
            </div>
          )}
          <Failure error={action.error} />
          {action.error && request.current && (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={action.isPending}
                onClick={() => {
                  if (request.current) action.mutate(request.current);
                }}
              >
                Retry exact action
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  request.current = null;
                  setCoverage(null);
                  action.reset();
                }}
              >
                Review refreshed state
              </Button>
            </div>
          )}
          {(generating || publishing) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const op = publishing ? acceptance : operation;
                if (op)
                  action.mutate({
                    type: "cancel",
                    data: { operationId: op.id, idempotencyKey: crypto.randomUUID() },
                  });
              }}
            >
              Cancel {publishing ? "publication" : "source operation"}
            </Button>
          )}
          {!accepted &&
            p?.state !== "Rejected" &&
            !generating &&
            !publishing &&
            (expired || operation?.state === "Failed" || operation?.state === "Cancelled") && (
              <>
                {task.previewAttempts < 3 &&
                  !stale &&
                  detail.runtimeConfigured &&
                  (p?.payload || detail.configured) &&
                  operation?.stage !== "Proposed source failed safety checks" && (
                    <Button variant="outline" disabled={busy} onClick={retry}>
                      {p?.payload
                        ? expired
                          ? "Rerender saved candidate"
                          : "Retry saved preview"
                        : "Retry generation"}
                    </Button>
                  )}
                {task.previewAttempts >= 3 && (
                  <p className="text-sm text-muted-foreground">
                    No preview attempts remain for this task.
                  </p>
                )}
                <Button variant="outline" onClick={() => setLaunch(true)}>
                  Request corrected proposal
                </Button>
              </>
            )}
          {pending && !publishing && (
            <>
              <label htmlFor={coverageId} className="flex items-start gap-3 text-sm leading-5">
                <Checkbox
                  id={coverageId}
                  className="mt-0.5"
                  checked={coverage === coverageKey}
                  disabled={!ready || busy}
                  onCheckedChange={(value) => setCoverage(value === true ? coverageKey : null)}
                />
                <span>
                  I reviewed all source, expected fields, extracted-text, meaning/support and
                  PDF/report changes for this exact candidate.
                </span>
              </label>
              <div className="flex flex-col gap-3">
                <Button
                  disabled={!ready || coverage !== coverageKey || busy || p.acceptanceAttempts >= 3}
                  onClick={() => decide("Accepted")}
                >
                  {p.acceptanceAttempts ? "Review & retry publication" : "Accept & save checkpoint"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || generating}
                  onClick={() => decide("Rejected")}
                >
                  Reject candidate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Acceptance starts artifact publication. The checkpoint appears after all four files
                are retained. Changed wording receives fresh evidence review.
              </p>
              {p.acceptanceAttempts >= 3 && (
                <p className="text-sm">
                  Publication reached its three-attempt limit. Inspect recovery details; base export
                  remains available.
                </p>
              )}
            </>
          )}
          {p?.resultCheckpointId && (
            <p className="break-all font-mono text-xs text-muted-foreground">
              {accepted ? "Saved" : "Reserved"} checkpoint {p.resultCheckpointId}
            </p>
          )}
          {accepted && p.resultCheckpointId && (
            <>
              <Link
                className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-3 font-semibold text-primary-foreground"
                to="/checkpoints/$checkpointId"
                params={{ checkpointId: p.resultCheckpointId }}
              >
                Review / export checkpoint
              </Link>
              <p className="text-sm text-muted-foreground">
                PDF, LaTeX, extracted text and validation report are retained. Earlier export
                acknowledgments do not carry over.
              </p>
            </>
          )}
          {p?.state === "Rejected" && (
            <p className="text-sm text-muted-foreground">
              Artifact cleanup is recoverable and may still be pending. Backup copies expire under
              normal retention.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-primary">
              Exact review and operation identities
            </summary>
            <div className="mt-3 space-y-2 break-all font-mono text-xs">
              <p>
                Task {task.id} · revision {task.revision}
              </p>
              <p>Candidate {p?.candidateDigest ?? "Unavailable"}</p>
              <p>Review {p?.reviewDigest ?? "Unavailable"}</p>
              <p>Preview {p?.previewOperationId ?? "Unavailable"}</p>
              <p>Latest operation {operation?.id}</p>
              <p>Publication {acceptance?.id ?? "Not started"}</p>
              <p>Model {task.profile.model}</p>
            </div>
          </details>
          <Button variant="outline" onClick={() => setCaptured(!captured)} aria-expanded={captured}>
            Captured input and support
          </Button>
        </aside>
      </div>
      {captured && (
        <section className="space-y-5 rounded-md border p-6">
          <h2 className="text-2xl">Captured input and current evidence</h2>
          <p className="whitespace-pre-wrap">{task.input.goal}</p>
          <p className="text-sm text-muted-foreground">
            Exact captured values are preserved below. Evidence inspectors show the pinned revision
            beside current review/lifecycle state.
          </p>
          <EvidenceLinks value={task.input.evidence} />
          <details>
            <summary className="cursor-pointer text-primary">
              Complete captured evidence, contexts and status
            </summary>
            <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
              {JSON.stringify(
                {
                  evidence: task.input.evidence,
                  statuses: task.input.statuses,
                  dependencies: task.dependencies,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {p?.payload && (
            <p className="whitespace-pre-wrap text-sm">
              Model explanation: {p.payload.explanation}
            </p>
          )}
        </section>
      )}
      {launch && (
        <>
          <Failure error={base.error} />
          {base.data ? (
            <SourceRefinements detail={base.data} onClose={() => setLaunch(false)} />
          ) : (
            <p role="status">Loading base checkpoint…</p>
          )}
        </>
      )}
    </>
  );
}
