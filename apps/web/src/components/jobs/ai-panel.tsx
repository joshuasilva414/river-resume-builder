import type { RetryJobAiRequest, ReviewJobAiRequest, StartJobAiRequest } from "@river/contracts";
import { canonicalJson, type JobAiTask } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cancelDocumentOperation } from "~/server/functions";
import {
  decideJobAi,
  generateJobAi,
  getJobAiTask,
  getJobAiTasks,
  retryJobAiTask,
} from "~/server/job-ai-functions";
import { RankingReview, RequirementComparison } from "./ai-review";
import type { Choice } from "./evidence-selection";
import type { JobDetail } from "./shared";

type Analysis = Extract<Awaited<ReturnType<typeof getJobAiTask>>, { ok: true }>["value"];
type Action =
  | { type: "generate"; data: Omit<StartJobAiRequest, "idempotencyKey"> }
  | { type: "retry"; data: Omit<RetryJobAiRequest, "idempotencyKey"> }
  | { type: "review"; data: Omit<ReviewJobAiRequest, "idempotencyKey"> }
  | { type: "cancel"; data: { operationId: string } };
const active = (state?: string) => state === "Pending" || state === "Running";
const title = (task: JobAiTask) =>
  task === "extract-requirements" ? "Requirement extraction" : "Evidence ranking";

/** Keep one key for an unchanged command after a lost response. Review receipts contain no generated text. */
function useAiAction(onSaved?: (id: string) => void) {
  const client = useQueryClient();
  const command = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (action: Action) => {
      const payload = canonicalJson(action);
      if (command.current?.payload !== payload)
        command.current = { payload, key: crypto.randomUUID() };
      const idempotencyKey = command.current.key;
      if (action.type === "generate")
        return unwrap(await generateJobAi({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "retry")
        return unwrap(await retryJobAiTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "review")
        return unwrap(await decideJobAi({ data: { ...action.data, idempotencyKey } })).id;
      unwrap(await cancelDocumentOperation({ data: { ...action.data, idempotencyKey } }));
      return action.data.operationId;
    },
    onSuccess: async (id, action) => {
      if (action.type === "review" && action.data.decision === "Rejected") {
        client.setQueriesData<Analysis>({ queryKey: ["job-ai", "detail"] }, (value) =>
          value?.proposal?.id === action.data.id
            ? { ...value, proposal: { ...value.proposal, payload: null, state: "Rejected" } }
            : value,
        );
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["job-ai"] }),
        client.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
      onSaved?.(id);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["job-ai"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function JobAiPanel({
  detail,
  readOnly,
  busy,
  onChoose,
  onManual,
}: {
  detail: JobDetail;
  readOnly: boolean;
  busy: boolean;
  onChoose: (choice: Choice) => void;
  onManual: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<
    | { type: "queue" }
    | { type: "task"; id: string }
    | { type: "launch"; task: JobAiTask; detail: JobDetail }
    | null
  >(null);
  const list = useQuery({
    queryKey: ["job-ai", "list", detail.job.id, offset],
    queryFn: async () => unwrap(await getJobAiTasks({ data: { jobId: detail.job.id, offset } })),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => active(item.operationState)) ? 1500 : false,
  });
  const close = () => setView(null);
  const manual = () => {
    close();
    onManual();
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!readOnly && list.data?.configured.requirements && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setView({ type: "launch", task: "extract-requirements", detail })}
          >
            Extract requirements
          </Button>
        )}
        {!readOnly &&
          list.data?.configured.ranking &&
          detail.workspace.data.requirements.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setView({ type: "launch", task: "rank-evidence", detail })}
            >
              Rank evidence
            </Button>
          )}
        {Boolean(list.data?.items.length || offset) && (
          <Button variant="outline" onClick={() => setView({ type: "queue" })}>
            Proposals
          </Button>
        )}
        {list.error && (
          <Button variant="ghost" onClick={() => void list.refetch()}>
            Retry loading proposal availability
          </Button>
        )}
      </div>
      {view?.type === "launch" && (
        <Launch
          key={view.task}
          detail={view.detail}
          task={view.task}
          onClose={close}
          onSaved={(id) => setView({ type: "task", id })}
        />
      )}
      {view?.type === "queue" && (
        <EvidenceDialog
          title="Job proposals"
          description="Generation and review are separate. Saved proposals remain here when AI is unavailable."
          onClose={close}
        >
          <div className="space-y-4">
            <Failure error={list.error} />
            {list.data?.items.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-sm border border-l-2 border-l-primary bg-accent/40 p-4"
              >
                <p className="eyebrow">{new Date(item.createdAt).toLocaleString()}</p>
                <h3 className="text-[17px] font-semibold">{title(item.task)}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Generation {item.operationState === "Pending" ? "Queued" : item.operationState}
                  </Badge>
                  <Badge variant="outline">
                    {item.reviewState ? `Review ${item.reviewState}` : "No proposal saved"}
                  </Badge>
                </div>
                <p className="text-sm">{item.stage}</p>
                <p className="font-mono text-[11px] break-all">Task {item.id}</p>
                <Button variant="outline" onClick={() => setView({ type: "task", id: item.id })}>
                  Open {item.reviewState === "Pending" ? "proposal" : "record"}
                </Button>
              </article>
            ))}
            {!list.data?.items.length && <p className="text-sm">No proposals on this page.</p>}
            {(offset > 0 || list.data?.hasMore) && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous proposals
                </Button>
                <Button
                  variant="outline"
                  disabled={!list.data?.hasMore}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next proposals
                </Button>
              </div>
            )}
          </div>
        </EvidenceDialog>
      )}
      {view?.type === "task" && (
        <TaskReview
          key={view.id}
          id={view.id}
          detail={detail}
          readOnly={readOnly}
          busy={busy}
          onClose={close}
          onBack={() => setView({ type: "queue" })}
          onManual={manual}
          onRegenerate={(task) => setView({ type: "launch", task, detail })}
          onChoose={(choice) => {
            onChoose(choice);
            close();
          }}
        />
      )}
    </>
  );
}

function Launch({
  detail,
  task,
  onClose,
  onSaved,
}: {
  detail: JobDetail;
  task: JobAiTask;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [scope, setScope] = useState("");
  const action = useAiAction(onSaved);
  return (
    <EvidenceDialog
      title={
        task === "extract-requirements"
          ? "Propose a Requirement Map"
          : "Rank a bounded evidence set"
      }
      description="The result requires your review. Generating a proposal preserves your saved work."
      onClose={onClose}
      pending={action.isPending}
      className="sm:max-w-[676px]"
    >
      <div className="space-y-5">
        <p className="font-semibold">
          {detail.job.details.role} · {detail.job.details.company}
        </p>
        <div className="space-y-2 rounded-sm border bg-muted p-4 text-sm">
          <p>Job revision {detail.job.revision}</p>
          <p className="font-mono text-[11px] break-all">Posting {detail.snapshot.id}</p>
          <p className="font-mono text-[11px] break-all">Map {detail.workspace.id}</p>
          <p>
            {detail.workspace.data.requirements.length} requirements · {detail.selected.length}{" "}
            evidence associations
          </p>
        </div>
        {task === "rank-evidence" && (
          <>
            <FormField label="Ranking scope">
              <select
                className={selectClass}
                value={scope}
                disabled={action.isPending}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="">All requirements and general relevance</option>
                {detail.workspace.data.requirements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.text}
                  </option>
                ))}
              </select>
            </FormField>
            <p className="text-sm">
              The server supplies up to 30 active evidence matches from keyword search. AI can rank
              only those exact revisions. Missing evidence remains an explicit gap.
            </p>
          </>
        )}
        {task === "extract-requirements" && (
          <p className="text-sm">
            Review the complete original and proposed maps before accepting. Removing a requirement
            can remove its evidence associations; those consequences will be shown before
            acceptance.
          </p>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
            Complete posting supplied to AI
          </summary>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {detail.snapshot.text}
          </p>
        </details>
        <Failure error={action.error} />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" disabled={action.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                type: "generate",
                data: {
                  jobId: detail.job.id,
                  revision: detail.job.revision,
                  snapshotId: detail.snapshot.id,
                  task,
                  requirementId: scope || null,
                },
              })
            }
          >
            {action.isPending ? "Saving task…" : "Generate proposal"}
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}

function TaskReview({
  id,
  detail,
  readOnly,
  busy,
  onClose,
  onBack,
  onManual,
  onRegenerate,
  onChoose,
}: {
  id: string;
  detail: JobDetail;
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  onBack: () => void;
  onManual: () => void;
  onRegenerate: (task: JobAiTask) => void;
  onChoose: (choice: Choice) => void;
}) {
  const query = useQuery({
    queryKey: ["job-ai", "detail", id, detail.job.revision],
    queryFn: async () => unwrap(await getJobAiTask({ data: { id } })),
    refetchInterval: (q) => (active(q.state.data?.operation?.state) ? 1500 : false),
  });
  const action = useAiAction();
  const [rejecting, setRejecting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const saved = query.data;
  const proposal = saved?.proposal,
    payload = proposal?.payload;
  const removed =
    payload?.type === "requirements" && saved
      ? saved.task.input.workspace.selections.filter(
          (selection) =>
            selection.requirementId &&
            !payload.requirements.some((item) => item.id === selection.requirementId),
        )
      : [];
  const disabled = action.isPending || busy;
  return (
    <EvidenceDialog
      title={saved ? title(saved.task.input.task) : "Job analysis"}
      description="Inspect the captured inputs, execution result, and review decision."
      onClose={onClose}
      pending={disabled}
      wide
    >
      <div className="space-y-5">
        <Button variant="link" className="px-0" disabled={disabled} onClick={onBack}>
          ← Proposals
        </Button>
        <Failure error={query.error} />
        {query.error && (
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry loading record
          </Button>
        )}
        {query.isPending && <p role="status">Loading saved analysis…</p>}
        {saved && (
          <>
            <Execution
              saved={saved}
              pending={action.isPending}
              onCancel={() => {
                if (saved.operation)
                  action.mutate({ type: "cancel", data: { operationId: saved.operation.id } });
              }}
              onRetry={() =>
                action.mutate({
                  type: "retry",
                  data: { id: saved.task.id, revision: saved.task.revision },
                })
              }
              readOnly={readOnly}
            />
            {saved.staleReasons.length > 0 && (
              <div className="space-y-3 rounded-sm border border-highlight bg-highlight/10 p-4">
                <h3 className="font-semibold">Inputs changed</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {saved.staleReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <p className="text-sm">
                  {proposal?.state === "Pending"
                    ? "Acceptance is unavailable. Nothing from this proposal has been applied."
                    : payload?.type === "requirements"
                      ? "This record retains the original input and reviewed map. Current work may include this accepted revision or later edits."
                      : "This record retains its original input. Inspect current evidence before choosing an association."}
                </p>
                {saved.configured && !readOnly && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onRegenerate(saved.task.input.task)}
                  >
                    Generate from current inputs
                  </Button>
                )}
              </div>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
                Captured inputs and current identities
              </summary>
              <div className="space-y-3 rounded-sm border p-4 text-sm">
                <p>
                  {saved.task.input.details.role} · {saved.task.input.details.company}
                </p>
                <p>
                  Captured job revision {saved.task.input.jobRevision} · current revision{" "}
                  {detail.job.revision}
                </p>
                <p className="font-mono text-[11px] break-all">
                  Captured posting {saved.task.input.snapshotId}
                  <br />
                  Current posting {detail.job.currentSnapshotId}
                  <br />
                  Captured map {saved.task.input.workspaceRevisionId}
                  <br />
                  Current map {detail.currentWorkspaceRevisionId}
                </p>
                <details>
                  <summary className="min-h-11 cursor-pointer py-3">
                    Complete immutable task input
                  </summary>
                  <pre className="max-h-80 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap break-all">
                    {JSON.stringify(saved.task.input, null, 2)}
                  </pre>
                </details>
              </div>
            </details>
            {proposal && (
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline">Review {proposal.state}</Badge>
                {proposal.reviewedAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(proposal.reviewedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            {payload && (
              <>
                <p className="text-sm whitespace-pre-wrap break-words">{payload.explanation}</p>
                {payload.type === "requirements" ? (
                  <RequirementComparison input={saved.task.input} proposal={payload} />
                ) : (
                  <RankingReview
                    input={saved.task.input}
                    proposal={payload}
                    detail={detail}
                    accepted={proposal?.state === "Accepted"}
                    readOnly={readOnly}
                    busy={disabled}
                    onChoose={onChoose}
                  />
                )}
              </>
            )}
            {proposal?.state === "Rejected" && (
              <p className="rounded-sm border p-4 text-sm">
                The generated proposal content was removed from live storage. The task and minimal
                review record remain.
              </p>
            )}
            {proposal?.state === "Pending" && payload && (
              <section className="space-y-4 rounded-sm border border-highlight bg-highlight/10 p-5">
                <h3 className="text-[17px] font-semibold">
                  {payload.type === "requirements"
                    ? "Accept this complete Requirement Map"
                    : "Record your ranking review"}
                </h3>
                <p className="text-sm">
                  {payload.type === "requirements"
                    ? "Acceptance creates a new immutable map revision. It preserves general evidence selections and associations for retained requirement identities."
                    : "Acceptance records this review. Evidence selections remain unchanged until you inspect and choose each association."}
                </p>
                {removed.length > 0 && (
                  <>
                    <p className="text-sm font-semibold">
                      Acceptance removes {removed.length} requirement-specific evidence
                      associations:
                    </p>
                    <ul className="space-y-3 text-sm">
                      {removed.map((item) => (
                        <li key={`${item.claimId}:${item.requirementId}`} className="space-y-1">
                          <p>
                            {
                              saved.task.input.workspace.requirements.find(
                                (requirement) => requirement.id === item.requirementId,
                              )?.text
                            }
                          </p>
                          <p className="font-mono text-[11px] break-all">
                            Claim {item.claimId} · revision {item.evidenceRevisionId}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <label className="flex min-h-11 items-start gap-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-5 shrink-0"
                        checked={acknowledged}
                        disabled={disabled}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                      />
                      I reviewed these removed associations.
                    </label>
                  </>
                )}
                {rejecting ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Rejecting removes the generated content from live storage and retains a
                      minimal decision record. Backup copies expire with retention. Your original
                      input remains.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() => setRejecting(false)}
                      >
                        Keep proposal
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={disabled}
                        onClick={() =>
                          action.mutate({
                            type: "review",
                            data: {
                              id: proposal.id,
                              revision: proposal.revision,
                              decision: "Rejected",
                              acknowledgeRemovedAssociations: false,
                            },
                          })
                        }
                      >
                        Confirm rejection
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={disabled || readOnly}
                      onClick={() => setRejecting(true)}
                    >
                      Reject proposal
                    </Button>
                    <Button variant="outline" disabled={disabled} onClick={onManual}>
                      Continue manually
                    </Button>
                    <Button
                      disabled={
                        disabled ||
                        readOnly ||
                        saved.staleReasons.length > 0 ||
                        (removed.length > 0 && !acknowledged)
                      }
                      onClick={() =>
                        action.mutate({
                          type: "review",
                          data: {
                            id: proposal.id,
                            revision: proposal.revision,
                            decision: "Accepted",
                            acknowledgeRemovedAssociations: acknowledged,
                          },
                        })
                      }
                    >
                      {payload.type === "requirements"
                        ? "Accept complete map"
                        : "Accept ranking review"}
                    </Button>
                  </div>
                )}
              </section>
            )}
            {!payload && proposal?.state !== "Rejected" && (
              <Button variant="outline" onClick={onManual}>
                Continue manually
              </Button>
            )}
          </>
        )}
        <div role="status" aria-live="polite">
          {action.isPending && <p className="text-sm">Saving your action…</p>}
          <Failure error={action.error} />
          {action.error && (
            <p className="mt-2 text-sm">
              The saved record above shows the latest confirmed state. Retry the same action if its
              result is uncertain.
            </p>
          )}
        </div>
      </div>
    </EvidenceDialog>
  );
}

function Execution({
  saved,
  pending,
  readOnly,
  onCancel,
  onRetry,
}: {
  saved: Analysis;
  pending: boolean;
  readOnly: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const operation = saved.operation;
  return (
    <section className="space-y-3 rounded-sm border bg-muted p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          Generation{" "}
          {operation?.state === "Pending" ? "Queued" : (operation?.state ?? "Unavailable")}
        </Badge>
        <p className="font-mono text-[11px]">Attempt {saved.task.attempts} of 3</p>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {operation?.stage}
      </p>
      {operation?.failure && <p className="text-sm">{operation.failure}</p>}
      <p className="font-mono text-[11px] break-all">
        {saved.task.profile.model} · {saved.task.profile.contract}
      </p>
      {active(operation?.state) && (
        <>
          <p className="text-xs text-muted-foreground">
            You can leave this page. Cancellation may wait for the current provider step to finish;
            late output cannot apply changes.
          </p>
          <Button variant="outline" disabled={pending || readOnly} onClick={onCancel}>
            Cancel analysis
          </Button>
        </>
      )}
      {(operation?.state === "Failed" || operation?.state === "Cancelled") && (
        <>
          {!saved.configured && (
            <p className="text-sm">
              This task profile is currently unavailable. Saved review records remain accessible.
            </p>
          )}
          {saved.task.attempts >= 3 && (
            <p className="text-sm">
              The three-attempt budget is exhausted. Continue manually or generate a new proposal.
            </p>
          )}
          {saved.configured &&
            saved.task.attempts < 3 &&
            !saved.proposal &&
            !saved.staleReasons.length &&
            !readOnly && (
              <Button variant="outline" disabled={pending} onClick={onRetry}>
                Retry analysis
              </Button>
            )}
        </>
      )}
    </section>
  );
}
