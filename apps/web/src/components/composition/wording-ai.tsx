import type {
  RetryWordingRequest,
  ReviewWordingRequest,
  StartWordingRequest,
} from "@river/contracts";
import {
  canonicalJson,
  captureWordingTarget,
  type WordingInput,
  type WordingPath,
} from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  MaterialSummary,
  unwrap,
} from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation } from "~/server/functions";
import {
  decideWording,
  generateWordingTask,
  getWordingTask,
  getWordingTasks,
  retryWordingTask,
} from "~/server/wording-functions";
import type { ResumeDetail } from "./use-draft";

type Detail = Extract<Awaited<ReturnType<typeof getWordingTask>>, { ok: true }>["value"];
type Action =
  | { type: "generate"; data: Omit<StartWordingRequest, "idempotencyKey"> }
  | { type: "retry"; data: Omit<RetryWordingRequest, "idempotencyKey"> }
  | { type: "review"; data: Omit<ReviewWordingRequest, "idempotencyKey"> }
  | { type: "cancel"; data: { operationId: string } };
const active = (state?: string) => state === "Pending" || state === "Running";
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
        return unwrap(await generateWordingTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "retry")
        return unwrap(await retryWordingTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "review")
        return unwrap(await decideWording({ data: { ...action.data, idempotencyKey } })).id;
      unwrap(await cancelDocumentOperation({ data: { ...action.data, idempotencyKey } }));
      return action.data.operationId;
    },
    onSuccess: async (id, action) => {
      if (action.type === "review" && action.data.decision === "Rejected")
        client.setQueriesData<Detail>({ queryKey: ["wording-ai", "detail"] }, (value) =>
          value?.proposal?.id === action.data.id
            ? { ...value, proposal: { ...value.proposal, payload: null, state: "Rejected" } }
            : value,
        );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["wording-ai"] }),
        client.invalidateQueries({ queryKey: ["resumes"] }),
      ]);
      onSaved?.(id);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["wording-ai"] });
      void client.invalidateQueries({ queryKey: ["resumes"] });
    },
  });
}
export function useWordingAssistance(
  detail: ResumeDetail,
  busy: boolean,
  onManual: (path: WordingPath) => void,
) {
  const [offset, setOffset] = useState(0),
    [view, setView] = useState<
      | { type: "queue" }
      | { type: "task"; id: string }
      | { type: "launch"; path: WordingPath; detail: ResumeDetail }
      | null
    >(null);
  const list = useQuery({
    queryKey: ["wording-ai", "list", detail.draft.id, offset],
    queryFn: async () =>
      unwrap(await getWordingTasks({ data: { draftId: detail.draft.id, offset } })),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => active(item.operationState)) ? 1500 : false,
  });
  const close = () => setView(null);
  return {
    configured: Boolean(list.data?.configured),
    launch: (path: WordingPath) => setView({ type: "launch", path, detail }),
    queueButton: (
      <>
        {Boolean(list.data?.items.length || offset) && (
          <Button variant="outline" onClick={() => setView({ type: "queue" })}>
            Wording proposals
          </Button>
        )}
        {list.error && (
          <Button variant="ghost" onClick={() => void list.refetch()}>
            Retry wording availability
          </Button>
        )}
      </>
    ),
    dialogs: (
      <>
        {view?.type === "launch" && (
          <Launch
            detail={view.detail}
            path={view.path}
            busy={busy}
            onClose={close}
            onSaved={(id) => setView({ type: "task", id })}
          />
        )}
        {view?.type === "queue" && (
          <EvidenceDialog
            title="Wording proposals"
            description="Review is separate from generation. Saved proposals remain available when AI is unavailable."
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
                  <h3 className="text-[17px] font-semibold whitespace-pre-wrap break-words">
                    {item.goal}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      Generation{" "}
                      {item.operationState === "Pending" ? "Queued" : item.operationState}
                    </Badge>
                    <Badge variant="outline">
                      {item.reviewState ? `Review ${item.reviewState}` : "No proposal saved"}
                    </Badge>
                  </div>
                  <p className="text-sm">{item.stage}</p>
                  <Button variant="outline" onClick={() => setView({ type: "task", id: item.id })}>
                    Open {item.reviewState === "Pending" ? "proposal" : "record"}
                  </Button>
                </article>
              ))}
              {!list.data?.items.length && (
                <p className="text-sm">No wording tasks on this page.</p>
              )}
              {(offset > 0 || list.data?.hasMore) && (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled={!offset}
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
          <Review
            key={view.id}
            id={view.id}
            current={detail}
            busy={busy}
            onClose={close}
            onBack={() => setView({ type: "queue" })}
            onManual={(path) => {
              close();
              onManual(path);
            }}
            onGenerate={(path) => setView({ type: "launch", path, detail })}
          />
        )}
      </>
    ),
  };
}
function Launch({
  detail,
  path,
  busy,
  onClose,
  onSaved,
}: {
  detail: ResumeDetail;
  path: WordingPath;
  busy: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [goal, setGoal] = useState(
      "Use the posting’s terminology where the selected evidence supports it.",
    ),
    action = useAction(onSaved);
  const target = captureWordingTarget(detail.draft.data, detail.graph, path);
  return (
    <EvidenceDialog
      title="Suggest wording for this placement"
      description="One Content placement · exact job snapshot · selected support"
      onClose={onClose}
      pending={action.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate({
            type: "generate",
            data: { draftId: detail.draft.id, revision: detail.draft.revision, path, goal },
          });
        }}
      >
        <FormField label="Wording goal">
          <Textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={2000}
            required
            rows={3}
          />
        </FormField>
        <p className="eyebrow">
          {target.sectionType} / {target.field} · saved draft revision {detail.draft.revision}
        </p>
        <p className="whitespace-pre-wrap break-words text-base leading-6">
          {target.content.wording}
        </p>
        <p className="text-sm text-muted-foreground">
          The model receives this wording, its {target.content.evidence.length} selected evidence
          links and their pinned context, and the complete posting snapshot. Other placements and
          the Requirement Map are excluded.
        </p>
        <EvidenceLinks value={target.content.evidence} />
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
            Exact posting supplied to AI
          </summary>
          <p className="font-mono text-[11px] break-all">Snapshot {detail.snapshot.id}</p>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {detail.snapshot.text}
          </p>
        </details>
        <p className="text-sm">
          Generation does not change this draft. Review the full wording, meaning, and support
          before accepting a local override.
        </p>
        <Failure error={action.error} />
        {busy && (
          <p role="status" className="text-sm text-warning">
            Finish saving or recovering the draft before continuing.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={action.isPending} onClick={onClose}>
            Keep editing
          </Button>
          <Button disabled={busy || action.isPending || !goal.trim()}>
            {action.isPending ? "Starting…" : "Generate proposal"}
          </Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
function CapturedSupport({
  input,
  proposed,
}: {
  input: WordingInput;
  proposed: readonly { claimId: string; revisionId: string }[];
}) {
  return (
    <section className="space-y-5">
      <h3 className="font-editorial text-2xl">Evidence and meaning</h3>
      {!input.evidence.length && (
        <p className="text-sm">
          No supporting evidence was supplied. Wording assistance cannot verify this content.
        </p>
      )}
      {input.evidence.map((item) => (
        <article
          key={`${item.claimId}:${item.evidenceRevisionId}`}
          className="space-y-3 rounded-sm border p-5"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{item.reviewState} at generation</Badge>
            <Badge variant="outline">
              {proposed.some(
                (ref) => ref.claimId === item.claimId && ref.revisionId === item.evidenceRevisionId,
              )
                ? "Retained support"
                : "Removed support"}
            </Badge>
            {item.archived && <Badge variant="outline">Archived</Badge>}
            {item.currentRevisionId !== item.evidenceRevisionId && (
              <Badge variant="outline">Older pinned revision</Badge>
            )}
          </div>
          <MaterialSummary
            material={item.material}
            contexts={item.contexts.map((context) => ({
              revisionId: context.pinnedRevisionId,
              data: context.data,
            }))}
          />
          {item.contexts.map((context) => (
            <details key={context.pinnedRevisionId} className="border-y py-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Captured {context.data.kind} · {context.data.label}
              </summary>
              <dl className="space-y-2 text-sm">
                <dt className="text-muted-foreground">Pinned context snapshot</dt>
                <dd>
                  {[
                    context.data.organization,
                    context.data.role,
                    context.data.startDate,
                    context.data.endDate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
                <dd className="whitespace-pre-wrap break-words">{context.data.details}</dd>
                {context.data.contact && (
                  <dd className="whitespace-pre-wrap break-words">
                    {[
                      context.data.contact.email,
                      context.data.contact.phone,
                      context.data.contact.location,
                      ...context.data.contact.links,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </dd>
                )}
                <dd className="font-mono text-[11px] break-all">{context.pinnedRevisionId}</dd>
              </dl>
            </details>
          ))}
          <p className="text-sm whitespace-pre-wrap break-words">
            Review rationale: {item.rationale || "No decision recorded."}
          </p>
          <p className="font-mono text-[11px] break-all">
            Claim {item.claimId} · Evidence Revision {item.evidenceRevisionId} · decision{" "}
            {item.decisionId ?? "None"}
          </p>
        </article>
      ))}
      {input.evidence.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
            Inspect current evidence and source provenance
          </summary>
          <EvidenceLinks
            value={input.evidence.map((item) => ({
              claimId: item.claimId,
              revisionId: item.evidenceRevisionId,
            }))}
          />
        </details>
      )}
    </section>
  );
}
function Review({
  id,
  busy,
  current,
  onClose,
  onBack,
  onManual,
  onGenerate,
}: {
  id: string;
  busy: boolean;
  current: ResumeDetail;
  onClose: () => void;
  onBack: () => void;
  onManual: (path: WordingPath) => void;
  onGenerate: (path: WordingPath) => void;
}) {
  const result = useQuery({
      queryKey: ["wording-ai", "detail", id],
      queryFn: async () => unwrap(await getWordingTask({ data: { id } })),
      refetchInterval: (query) => (active(query.state.data?.operation?.state) ? 1500 : false),
    }),
    action = useAction();
  const detail = result.data,
    proposal = detail?.proposal,
    input = detail?.task.input,
    payload = proposal?.payload;
  const targetPresent =
    input &&
    current.draft.data.sections
      .find((section) => section.id === input.target.path.sectionId)
      ?.blocks.find((block) => block.id === input.target.path.blockId)
      ?.fields.some((field) =>
        field.contents.some((content) => content.id === input.target.path.contentId),
      );
  return (
    <EvidenceDialog
      title="Review suggested wording"
      description="Compare complete wording and support. Acceptance creates a local override for this placement."
      onClose={onClose}
      pending={action.isPending}
      wide
    >
      <div className="space-y-5">
        <Button className="self-start" variant="ghost" disabled={action.isPending} onClick={onBack}>
          All wording proposals
        </Button>
        <Failure error={result.error} />
        <Failure error={action.error} />
        {result.isPending && <p role="status">Loading proposal…</p>}
        {result.error && <Button onClick={() => void result.refetch()}>Retry proposal</Button>}
        {detail && input && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Generation{" "}
                {detail.operation?.state === "Pending" ? "Queued" : detail.operation?.state}
              </Badge>
              <Badge variant="outline">
                {proposal ? `Review ${proposal.state}` : "No proposal saved"}
              </Badge>
            </div>
            <p className="text-sm" role="status">
              {detail.operation?.stage} · attempt {detail.task.attempts} of 3
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">Goal: {input.goal}</p>
            {active(detail.operation?.state) && (
              <Button
                variant="outline"
                className="self-start"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    type: "cancel",
                    data: { operationId: detail.task.latestOperationId },
                  })
                }
              >
                Cancel generation
              </Button>
            )}
            {detail.operation?.failure && (
              <p role="alert" className="rounded-sm border border-destructive p-4 text-sm">
                {detail.operation.failure}
              </p>
            )}
            {detail.staleReasons.length > 0 && (
              <div className="space-y-2 rounded-sm border border-warning bg-warning/5 p-4 text-sm">
                <p className="font-semibold">
                  {proposal?.state === "Pending"
                    ? "Proposal inputs changed"
                    : "Inputs differ from the current draft"}
                </p>
                {detail.staleReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                <p>
                  {proposal?.state === "Pending"
                    ? "Nothing will be applied. Review a new proposal from current inputs or edit manually."
                    : "This historical record retains its original inputs and decision."}
                </p>
              </div>
            )}
            {payload && (
              <>
                <div className="grid items-start gap-4 md:grid-cols-2">
                  {[
                    { label: "Original wording", text: input.target.content.wording },
                    { label: "Proposed wording", text: payload.wording },
                  ].map((item) => (
                    <section
                      key={item.label}
                      className="min-w-0 space-y-5 rounded-lg border bg-card p-6"
                    >
                      <h3 className="eyebrow">{item.label}</h3>
                      <p className="text-base leading-6 whitespace-pre-wrap break-words">
                        {item.text}
                      </p>
                    </section>
                  ))}
                </div>
                <section className="space-y-3 rounded-lg border p-6">
                  <h3 className="font-editorial text-2xl">Meaning review</h3>
                  <Badge variant="outline">AI assessment: {payload.meaning.assessment}</Badge>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {payload.meaning.explanation}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Proposed rationale: {payload.reason}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This assessment is a suggestion. Confirm that the complete wording stays within
                    the supporting evidence. Accepting wording does not verify a claim.
                  </p>
                </section>
                <CapturedSupport input={input} proposed={payload.evidence} />
                {payload.passages.map((passage) => (
                  <article className="space-y-2" key={`${passage.start}:${passage.end}`}>
                    <blockquote className="border-l-2 border-primary bg-muted p-4 whitespace-pre-wrap break-words">
                      {passage.quote}
                    </blockquote>
                    <p className="font-mono text-[11px]">
                      Posting offsets {passage.start}–{passage.end} · lines{" "}
                      {input.snapshot.text.slice(0, passage.start).split("\n").length}–
                      {input.snapshot.text.slice(0, passage.end).split("\n").length}
                    </p>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
                        Locate in complete posting
                      </summary>
                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                        {input.snapshot.text.slice(0, passage.start)}
                        <mark>{passage.quote}</mark>
                        {input.snapshot.text.slice(passage.end)}
                      </p>
                    </details>
                  </article>
                ))}
              </>
            )}
            {proposal?.state === "Rejected" && (
              <p className="rounded-sm border p-4 text-sm">
                Rejected. The generated payload was removed from live storage. This record retains
                task and decision metadata.
              </p>
            )}
            {proposal?.state === "Accepted" && (
              <p className="rounded-sm border border-primary p-4 text-sm" role="status">
                Accepted into saved draft revision {proposal.appliedRevision}. Only this placement
                received a local wording override. The library and historical outputs retain their
                original values.
              </p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
                Exact input and execution identity
              </summary>
              <div className="space-y-3 text-sm">
                <p className="font-mono text-[11px] break-all">
                  Task {detail.task.id} · {detail.task.profile.model} ·{" "}
                  {detail.task.profile.contract}
                </p>
                <p className="font-mono text-[11px] break-all">
                  Snapshot {input.snapshot.id} · target {input.targetDigest} · proposal{" "}
                  {proposal?.digest ?? "Not generated"}
                </p>
                <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                  {input.snapshot.text}
                </p>
                <pre className="max-h-80 overflow-auto rounded-sm bg-muted p-4 text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
            </details>
            {busy && (
              <p role="status" className="text-sm">
                Finish saving or recovering this tab's draft before applying wording.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              {!proposal &&
                detail.configured &&
                detail.task.attempts < 3 &&
                ["Failed", "Cancelled"].includes(detail.operation?.state ?? "") && (
                  <Button
                    variant="outline"
                    disabled={busy || action.isPending || detail.staleReasons.length > 0}
                    onClick={() =>
                      action.mutate({
                        type: "retry",
                        data: { id: detail.task.id, revision: detail.task.revision },
                      })
                    }
                  >
                    Retry generation
                  </Button>
                )}
              {proposal?.state === "Pending" && (
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      type: "review",
                      data: {
                        id: proposal.id,
                        revision: proposal.revision,
                        digest: proposal.digest,
                        decision: "Rejected",
                      },
                    })
                  }
                >
                  Reject proposal
                </Button>
              )}
              <div className="hidden flex-wrap gap-3 lg:flex">
                <Button
                  variant="outline"
                  disabled={busy || action.isPending || !targetPresent}
                  onClick={() => onManual(input.target.path)}
                >
                  Edit wording manually
                </Button>
                {proposal?.state === "Pending" && (
                  <Button
                    disabled={busy || action.isPending || detail.staleReasons.length > 0}
                    onClick={() =>
                      action.mutate({
                        type: "review",
                        data: {
                          id: proposal.id,
                          revision: proposal.revision,
                          digest: proposal.digest,
                          decision: "Accepted",
                        },
                      })
                    }
                  >
                    Accept for this placement
                  </Button>
                )}
                {detail.configured && detail.staleReasons.length > 0 && (
                  <Button
                    variant="outline"
                    disabled={busy || action.isPending || !targetPresent}
                    onClick={() => onGenerate(input.target.path)}
                  >
                    Generate from current inputs
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground lg:hidden">
              Apply or edit wording on a larger screen. You can review the complete proposal here.
            </p>
          </>
        )}
      </div>
    </EvidenceDialog>
  );
}
