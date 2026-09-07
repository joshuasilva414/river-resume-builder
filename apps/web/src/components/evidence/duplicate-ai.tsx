import type {
  RetryDuplicateAiRequest,
  ReviewDuplicateAiRequest,
  ReviewedComparisonOrigin,
  StartDuplicateAiRequest,
} from "@river/contracts";
import type { AiSelection } from "@river/domain";
import { canonicalJson, type DuplicateAiInput, type EvidenceMaterial } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  decideDuplicateAi,
  generateDuplicateAiTask,
  getDuplicateAiTask,
  getDuplicateAiTasks,
  previewDuplicateAiInput,
  retryDuplicateAiTask,
} from "~/server/duplicate-ai-functions";
import { cancelDocumentOperation } from "~/server/functions";
import { ClaimEditor } from "./claim-editor";
import { ContextSnapshot } from "./context-snapshot";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
  useContexts,
  useEvidenceCommand,
  useEvidenceDetail,
} from "./shared";

type Detail = Extract<Awaited<ReturnType<typeof getDuplicateAiTask>>, { ok: true }>["value"];
type Pair = Pick<NonNullable<Detail["pair"]>, "id" | "revision" | "firstId" | "secondId">;
type Action =
  | { type: "generate"; data: Omit<StartDuplicateAiRequest, "idempotencyKey"> }
  | { type: "retry"; data: Omit<RetryDuplicateAiRequest, "idempotencyKey"> }
  | { type: "review"; data: Omit<ReviewDuplicateAiRequest, "idempotencyKey"> }
  | { type: "cancel"; data: { operationId: string } };
const active = (state?: string) => state === "Pending" || state === "Running";
const reviewLabel = (state?: string | null) =>
  state === "Accepted" ? "Reviewed" : state === "Pending" ? "Awaiting review" : state;
function useAction(onSaved?: (id: string) => void) {
  const client = useQueryClient(),
    command = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (action: Action) => {
      const payload = canonicalJson(action);
      if (command.current?.payload !== payload)
        command.current = { payload, key: crypto.randomUUID() };
      const idempotencyKey = command.current.key;
      if (action.type === "generate")
        return unwrap(await generateDuplicateAiTask({ data: { ...action.data, idempotencyKey } }))
          .id;
      if (action.type === "retry")
        return unwrap(await retryDuplicateAiTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "review")
        return unwrap(await decideDuplicateAi({ data: { ...action.data, idempotencyKey } })).id;
      unwrap(await cancelDocumentOperation({ data: { ...action.data, idempotencyKey } }));
      return action.data.operationId;
    },
    onSuccess: async (id, action) => {
      if (action.type === "review" && action.data.decision === "Rejected")
        client.setQueriesData<Detail>({ queryKey: ["duplicate-ai", "detail"] }, (value) =>
          value?.proposal?.id === action.data.id
            ? { ...value, proposal: { ...value.proposal, state: "Rejected", payload: null } }
            : value,
        );
      await client.invalidateQueries({ queryKey: ["duplicate-ai"] });
      onSaved?.(id);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["duplicate-ai"] });
    },
  });
}
function useComparisons(claimId: string, offset = 0) {
  return useQuery({
    queryKey: ["duplicate-ai", "list", claimId, offset],
    queryFn: async () => unwrap(await getDuplicateAiTasks({ data: { claimId, offset } })),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => active(item.state)) ? 1500 : false,
  });
}
function Citations({ material }: { material: EvidenceMaterial }) {
  return (
    <div className="space-y-4">
      {!material.citations.length && (
        <p className="text-sm text-muted-foreground">No cited passages.</p>
      )}
      {material.citations.map((citation) => (
        <article
          key={`${citation.processingId}:${citation.start}:${citation.end}`}
          className="space-y-2 text-sm"
        >
          <blockquote className="border-l-2 border-primary pl-3 whitespace-pre-wrap break-words">
            {citation.quote}
          </blockquote>
          <p>
            {citation.attestation ? "Owner attestation · " : ""}
            {[
              ...new Set(
                citation.locators.map((l) =>
                  l.page ? `Page ${l.page}` : l.line ? `Line ${l.line}` : "Exact offsets",
                ),
              ),
            ].join(" · ")}
          </p>
        </article>
      ))}
    </div>
  );
}
function CapturedInputs({ input }: { input: DuplicateAiInput }) {
  return (
    <div className="space-y-6">
      {[input.first, input.second].map((claim, index) => (
        <section key={claim.claimId} className="space-y-3 border-t pt-4">
          <p className="eyebrow">
            {index ? "Second" : "First"} claim · Captured revision {claim.revision} · Active
          </p>
          <p className="text-lg font-semibold whitespace-pre-wrap break-words">
            {claim.material.assertion}
          </p>
          <Badge variant="outline">{claim.decision?.state ?? "Draft"}</Badge>
          {claim.decision && (
            <p className="whitespace-pre-wrap text-sm">
              Review rationale: {claim.decision.rationale}
            </p>
          )}
          <Citations material={claim.material} />
          {claim.material.contexts.map((reference) => {
            const context = input.contexts.find(
              (item) => item.id === reference.id && item.revisionId === reference.revisionId,
            );
            return (
              context && (
                <div key={context.revisionId} className="space-y-2">
                  <ContextSnapshot data={context.data} revisionId={context.revisionId} />
                </div>
              )
            );
          })}
        </section>
      ))}
      <details className="text-sm">
        <summary className="cursor-pointer">Source observations at generation</summary>
        <div className="mt-3 space-y-4">
          {input.sources.map((source) => (
            <dl key={source.id} className="space-y-1 break-all text-xs">
              <dt className="font-medium text-sm">{source.title}</dt>
              <dd>
                {source.kind} · {source.state} · Revision {source.revision}
              </dd>
              <dd className="font-mono">Source {source.id}</dd>
              <dd className="font-mono">Original SHA-256 {source.digest}</dd>
              <dd className="font-mono">
                Current processing result {source.currentProcessingId ?? "None"}
              </dd>
            </dl>
          ))}
        </div>
      </details>
    </div>
  );
}
function CurrentClaim({ id, label }: { id: string; label: string }) {
  const query = useEvidenceDetail(id),
    contexts = useContexts(),
    detail = query.data;
  const revision = detail?.revisions.find((item) => item.id === detail.claim.currentRevisionId);
  const decision = detail?.decisions.find((item) => item.id === detail.claim.currentDecisionId);
  return (
    <section className="space-y-3 border-t pt-4">
      <p className="eyebrow">{label} · Current provenance</p>
      <Failure error={query.error ?? contexts.error} />
      {query.isPending && <p>Loading current claim…</p>}
      {detail && revision && (
        <>
          <p className="text-lg font-semibold whitespace-pre-wrap break-words">
            {revision.material.assertion}
          </p>
          <p className="text-sm">
            {detail.claim.reviewState} · Revision {detail.claim.revision} ·{" "}
            {detail.claim.archivedAt ? "Archived" : "Active"}
          </p>
          <p className="break-all font-mono text-xs">Evidence revision {revision.id}</p>
          {decision && (
            <p className="text-sm whitespace-pre-wrap">Review rationale: {decision.rationale}</p>
          )}
          <Citations material={revision.material} />
          {revision.material.contexts.map((reference) => {
            const pinned = detail.contexts.find((item) => item.revisionId === reference.revisionId);
            const current = contexts.data?.find((item) => item.id === reference.id);
            return (
              <div key={reference.id} className="space-y-2">
                <p className="text-sm font-medium">Context pinned to current evidence</p>
                {pinned && <ContextSnapshot data={pinned.data} revisionId={pinned.revisionId} />}
                {current && current.revisionId !== reference.revisionId && (
                  <>
                    <p className="text-sm text-warning">The context now has a newer revision.</p>
                    <ContextSnapshot data={current.data} revisionId={current.revisionId} />
                  </>
                )}
              </div>
            );
          })}
          {detail.sources.map((source) => (
            <p key={source.id} className="text-sm">
              {source.title} · {source.state} · Revision {source.revision}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
function Launch({
  pair,
  firstRevision,
  secondRevision,
  onClose,
  onSaved,
}: {
  pair: Pair;
  firstRevision: number;
  secondRevision: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [ai, setAi] = useState<AiSelection>();
  const [input] = useState({
    pairId: pair.id,
    revision: pair.revision,
    firstRevision,
    secondRevision,
  });
  const preview = useQuery({
    queryKey: ["duplicate-ai", "preflight", input],
    queryFn: async () =>
      unwrap(await previewDuplicateAiInput({ data: { ...input, idempotencyKey: "preflight" } })),
    retry: false,
  });
  const action = useAction(onSaved);
  return (
    <EvidenceDialog
      title="Generate comparison"
      description="Review these two claims, exact cited passages, context values, and review decisions. Job targets, résumés, and unrelated evidence are outside this request."
      onClose={onClose}
      pending={action.isPending}
      className="sm:max-w-[676px]"
    >
      <div className="space-y-5">
        <AiSelector value={ai} onChange={setAi} />
        <Failure error={preview.error ?? action.error} />
        {preview.isPending && <p>Checking complete input…</p>}
        {preview.data && (
          <>
            <CapturedInputs input={preview.data.input} />
            <p role="status" className="font-mono text-xs">
              Total input {preview.data.characters.toLocaleString()} /{" "}
              {preview.data.limit.toLocaleString()} UTF-16 units
            </p>
            {!preview.data.allowed && (
              <p role="alert" className="text-sm text-destructive">
                The complete input exceeds the limit. Nothing was shortened. Close this dialog to
                continue manually.
              </p>
            )}
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Generation creates an advisory comparison for review. It does not change either claim or
          resolve the pair.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={action.isPending}>
            Return to manual review
          </Button>
          <Button
            disabled={
              action.isPending ||
              preview.isFetching ||
              !preview.data?.allowed ||
              Boolean(preview.error)
            }
            onClick={() => action.mutate({ type: "generate", data: { ...input, ai } })}
          >
            {action.isPending ? "Queuing…" : "Generate comparison"}
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
export function DuplicateHistory({ claimId }: { claimId: string }) {
  const [offset, setOffset] = useState(0),
    [id, setId] = useState<string | null>(null);
  const query = useComparisons(claimId, offset);
  if (!query.data?.items.length && !query.error && !offset) return null;
  return (
    <section className="space-y-3 border-t pt-4" aria-label="Saved AI comparisons">
      <p className="eyebrow">Saved AI comparisons</p>
      <Failure error={query.error} />
      {query.data?.items.map((item) => (
        <article key={item.id} className="space-y-2 border-b pb-3">
          <p className="text-sm font-semibold">{reviewLabel(item.reviewState) ?? item.state}</p>
          <p className="break-all font-mono text-xs">{item.id}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </p>
          <Button size="sm" variant="outline" onClick={() => setId(item.id)}>
            {item.reviewState === "Rejected" ? "View decision record" : "View saved comparison"}
          </Button>
        </article>
      ))}
      {(offset > 0 || query.data?.hasMore) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous comparisons
          </Button>
          <Button
            variant="outline"
            disabled={!query.data?.hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Next comparisons
          </Button>
        </div>
      )}
      {id && <ComparisonReview key={id} id={id} onClose={() => setId(null)} />}
    </section>
  );
}
function ComparisonReview({
  id,
  onClose,
  onUse,
}: {
  id: string;
  onClose: () => void;
  onUse?: (origin: ReviewedComparisonOrigin | undefined) => void;
}) {
  const query = useQuery({
    queryKey: ["duplicate-ai", "detail", id],
    queryFn: async () => unwrap(await getDuplicateAiTask({ data: { id } })),
    refetchInterval: (query) => (active(query.state.data?.operation?.state) ? 1500 : false),
  });
  const action = useAction(),
    [view, setView] = useState<"findings" | "captured" | "current">("findings"),
    [attribute, setAttribute] = useState(false),
    [manual, setManual] = useState<{ pair: Pair; origin?: ReviewedComparisonOrigin } | null>(null);
  const detail = query.data,
    proposal = detail?.proposal,
    operation = detail?.operation;
  const current = Boolean(detail && !detail.staleReasons.length),
    reviewed = proposal?.state === "Accepted";
  const useManual = () => {
    const origin = attribute && proposal ? { id: proposal.id, digest: proposal.digest } : undefined;
    if (onUse) onUse(origin);
    else if (detail?.pair) setManual({ pair: detail.pair, origin });
  };
  if (manual)
    return (
      <DuplicateDialog
        pair={manual.pair}
        initialOrigin={manual.origin}
        onClose={() => setManual(null)}
        onSaved={onClose}
      />
    );
  return (
    <EvidenceDialog
      title="AI duplicate comparison"
      description="An advisory explanation of the saved inputs. Reviewing it and deciding what to do with the claims are separate actions."
      onClose={onClose}
      pending={action.isPending}
      className="sm:max-w-[676px]"
    >
      <div className="space-y-5">
        <Failure error={query.error ?? action.error} />
        {query.isPending && <p>Loading saved comparison…</p>}
        {detail && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {reviewLabel(proposal?.state) ?? "No comparison saved"}
              </Badge>
              <Badge variant="outline">Pair: {detail.pairState}</Badge>
            </div>
            <p role="status" className="text-sm">
              {operation?.state} · {operation?.stage} · Attempt {detail.task.attempts} / 3
            </p>
            {operation?.failure && (
              <p role="alert" className="text-sm text-destructive">
                {operation.failure}
              </p>
            )}
            {active(operation?.state) && operation && (
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ type: "cancel", data: { operationId: operation.id } })
                }
              >
                Cancel generation
              </Button>
            )}
            {detail.configured &&
              operation &&
              ["Failed", "Cancelled"].includes(operation.state) &&
              detail.task.attempts < 3 &&
              current &&
              !proposal && (
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ type: "retry", data: { id, revision: detail.task.revision } })
                  }
                >
                  Retry same inputs
                </Button>
              )}
            {!current && (
              <div className="space-y-2 rounded-sm border border-warning p-4 text-sm">
                <p className="font-semibold">Inputs changed</p>
                {detail.staleReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                <p>
                  {reviewed
                    ? "This reviewed comparison remains historical. It cannot be linked to a new decision."
                    : "This saved comparison can be inspected or rejected. It cannot be marked reviewed."}
                </p>
              </div>
            )}
            <fieldset className="flex flex-wrap gap-2" aria-label="Comparison inspection">
              {(
                [
                  ["findings", "Findings"],
                  ["captured", "Captured inputs"],
                  ["current", "Current provenance"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  variant={view === value ? "secondary" : "outline"}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
            {view === "captured" && <CapturedInputs input={detail.task.input} />}
            {view === "current" && (
              <>
                <CurrentClaim id={detail.task.firstClaimId} label="First claim" />
                <CurrentClaim id={detail.task.secondClaimId} label="Second claim" />
              </>
            )}
            {view === "findings" &&
              (proposal?.payload ? (
                <div className="space-y-5">
                  <p className="text-sm">
                    AI assessment: <strong>{proposal.payload.assessment}</strong>
                  </p>
                  {(
                    [
                      ["shared", "Shared"],
                      ["different", "Different"],
                      ["uncertain", "Uncertain"],
                    ] as const
                  ).map(([key, label]) => (
                    <section key={key} className="space-y-3 border-t pt-4">
                      <h3 className="font-sans text-xl leading-[29px] font-semibold">{label}</h3>
                      {!proposal.payload?.[key].length && (
                        <p className="text-sm text-muted-foreground">No findings in this group.</p>
                      )}
                      {proposal.payload?.[key].map((finding, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Findings belong to an immutable saved result.
                        <div key={`${index}:${finding.scope}`} className="space-y-1">
                          <p className="eyebrow">{finding.scope}</p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-5">
                            {finding.explanation}
                          </p>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="text-sm">
                  {proposal?.state === "Rejected"
                    ? "Generated findings were removed. Original evidence and the decision record remain."
                    : "No generated comparison is available yet. Manual claim review remains available."}
                </p>
              ))}
            {proposal?.state === "Pending" && proposal.payload && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Mark reviewed acknowledges this exact explanation. It does not merge, keep
                  separate, or verify either claim.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        type: "review",
                        data: {
                          id: proposal.id,
                          digest: proposal.digest,
                          revision: proposal.revision,
                          decision: "Rejected",
                        },
                      })
                    }
                  >
                    Reject comparison
                  </Button>
                  <Button
                    disabled={action.isPending || !current}
                    onClick={() =>
                      action.mutate({
                        type: "review",
                        data: {
                          id: proposal.id,
                          digest: proposal.digest,
                          revision: proposal.revision,
                          decision: "Accepted",
                        },
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                </div>
              </div>
            )}
            {detail.pairState === "Pending" && (
              <section className="space-y-3 border-t pt-4">
                <h3 className="font-semibold">Manual decision</h3>
                {reviewed && current && (
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={attribute}
                      onChange={(event) => setAttribute(event.target.checked)}
                    />
                    Link comparison in this decision’s history
                  </label>
                )}
                {attribute && !current && (
                  <p role="alert" className="text-sm text-destructive">
                    The selected attribution is stale. Explicitly clear it to continue manually.
                  </p>
                )}
                {attribute && !current && (
                  <Button variant="outline" onClick={() => setAttribute(false)}>
                    Continue without comparison attribution
                  </Button>
                )}
                <p className="text-sm text-muted-foreground">
                  Review the current assertions, support, and rationale before Keep separate or
                  Merge. A failed attributed decision saves nothing.
                </p>
                <Button
                  variant="outline"
                  disabled={action.isPending || (attribute && !current)}
                  onClick={useManual}
                >
                  Review pair decision
                </Button>
              </section>
            )}
            {detail.pairDecision && (
              <section className="space-y-2 border-t pt-4">
                <p className="font-semibold">
                  Saved pair decision ·{" "}
                  {detail.pairDecision.command === "merge-evidence" ? "Merged" : "Kept separate"}
                </p>
                <p className="whitespace-pre-wrap text-sm">{detail.pairDecision.rationale}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(detail.pairDecision.createdAt).toLocaleString()}
                </p>
              </section>
            )}
            {proposal?.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                {reviewLabel(proposal.state)} · {new Date(proposal.reviewedAt).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    </EvidenceDialog>
  );
}
export function DuplicateDialog({
  pair,
  onClose,
  onSaved,
  initialOrigin,
}: {
  pair: Pair;
  onClose: () => void;
  onSaved: (id: string) => void;
  initialOrigin?: ReviewedComparisonOrigin;
}) {
  const first = useEvidenceDetail(pair.firstId),
    second = useEvidenceDetail(pair.secondId);
  const [merge, setMerge] = useState(false),
    [reversed, setReversed] = useState(false),
    [rationale, setRationale] = useState(""),
    [origin, setOrigin] = useState(initialOrigin),
    [view, setView] = useState<"launch" | null>(null),
    [taskId, setTaskId] = useState<string | null>(null);
  const separate = useEvidenceCommand(onClose),
    comparisons = useComparisons(pair.firstId);
  if (merge && first.data && second.data)
    return (
      <ClaimEditor
        detail={reversed ? second.data : first.data}
        mergeSource={reversed ? first.data : second.data}
        comparisonOrigin={origin}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  if (view === "launch" && first.data && second.data)
    return (
      <Launch
        pair={pair}
        firstRevision={first.data.claim.revision}
        secondRevision={second.data.claim.revision}
        onClose={() => setView(null)}
        onSaved={(id) => {
          setView(null);
          setTaskId(id);
        }}
      />
    );
  if (taskId)
    return (
      <ComparisonReview
        id={taskId}
        onClose={() => setTaskId(null)}
        onUse={(value) => {
          setOrigin(value);
          setTaskId(null);
        }}
      />
    );
  return (
    <EvidenceDialog
      title="Compare claims"
      description="Review the assertions and supporting material before choosing what to keep."
      onClose={onClose}
      wide
      dirty={Boolean(rationale)}
      pending={separate.isPending}
    >
      <div className="space-y-5">
        <Failure error={first.error ?? second.error ?? separate.error ?? comparisons.error} />
        <div className="grid gap-5 sm:grid-cols-2">
          {[first.data, second.data].map(
            (detail, index) =>
              detail && (
                <article key={detail.claim.id} className="min-w-0 space-y-3">
                  <p className="eyebrow">{index ? "Second" : "First"} claim</p>
                  <p className="font-editorial text-xl leading-7 whitespace-pre-wrap break-words">
                    {detail.claim.assertion}
                  </p>
                  <p className="text-muted-foreground">
                    {detail.claim.reviewState} · Revision {detail.claim.revision} ·{" "}
                    {detail.claim.archivedAt ? "Archived" : "Active"}
                  </p>
                  {detail.revisions
                    .filter((r) => r.id === detail.claim.currentRevisionId)
                    .map((revision) => (
                      <Citations key={revision.id} material={revision.material} />
                    ))}
                </article>
              ),
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {comparisons.data?.configured && (
            <Button
              variant="outline"
              disabled={
                !first.data ||
                !second.data ||
                Boolean(first.data.claim.archivedAt || second.data.claim.archivedAt)
              }
              onClick={() => setView("launch")}
            >
              Generate AI comparison
            </Button>
          )}
          {comparisons.data?.items
            .filter((item) => item.pairId === pair.id)
            .map((item) => (
              <Button key={item.id} size="sm" variant="outline" onClick={() => setTaskId(item.id)}>
                Comparison {item.id.slice(-8)} · {reviewLabel(item.reviewState) ?? item.state} ·{" "}
                {new Date(item.createdAt).toLocaleTimeString()}
              </Button>
            ))}
        </div>
        {origin && (
          <div className="space-y-3 rounded-sm border p-4 text-sm">
            <p>
              This decision will link the reviewed comparison. Changed comparison inputs block the
              whole decision.
            </p>
            <p className="break-all font-mono text-xs">{origin.id}</p>
            <Button variant="outline" onClick={() => setOrigin(undefined)}>
              Continue without comparison attribution
            </Button>
          </div>
        )}
        <FormField label="Keep separate rationale">
          <Textarea
            value={rationale}
            maxLength={4000}
            onChange={(event) => setRationale(event.target.value)}
          />
        </FormField>
        <Button
          variant="outline"
          disabled={!rationale.trim() || separate.isPending}
          onClick={() =>
            separate.mutate({
              type: "keep-separate",
              id: pair.id,
              revision: pair.revision,
              rationale,
              ...(origin ? { comparisonOrigin: origin } : {}),
            })
          }
        >
          Keep separate
        </Button>
        <div className="space-y-4 border-t pt-5">
          <FormField label="If merging, keep">
            <select
              className={selectClass}
              value={reversed ? "second" : "first"}
              onChange={(event) => setReversed(event.target.value === "second")}
            >
              <option value="first">First claim</option>
              <option value="second">Second claim</option>
            </select>
          </FormField>
          <Button
            disabled={
              !first.data ||
              !second.data ||
              separate.isPending ||
              Boolean(first.data?.claim.archivedAt || second.data?.claim.archivedAt)
            }
            onClick={() => setMerge(true)}
          >
            Review merged revision
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
