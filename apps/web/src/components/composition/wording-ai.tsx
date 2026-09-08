import type {
  RetryWordingRequest,
  ReviewWordingRequest,
  StartWordingRequest,
} from "@river/contracts";
import type { AiSelection } from "@river/domain";
import {
  canonicalJson,
  captureWordingTarget,
  type WordingInput,
  type WordingPath,
  type WordingProposal,
} from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
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
import { WordingBulk } from "./wording-bulk";

type Detail = Extract<Awaited<ReturnType<typeof getWordingTask>>, { ok: true }>["value"];
type Action =
  | { type: "generate"; data: Omit<StartWordingRequest, "idempotencyKey"> }
  | { type: "retry"; data: Omit<RetryWordingRequest, "idempotencyKey"> }
  | { type: "review"; data: Omit<ReviewWordingRequest, "idempotencyKey"> }
  | { type: "cancel"; data: { operationId: string } };
const active = (state?: string) => state === "Pending" || state === "Running";
type ApplyWording = (
  input: WordingInput,
  proposal: WordingProposal,
  perform: () => Promise<string>,
) => Promise<string>;
function useAction(
  onSaved?: (id: string) => void,
  onAccept?: (perform: () => Promise<string>) => Promise<string>,
) {
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
      if (action.type === "review") {
        const perform = async () =>
          unwrap(await decideWording({ data: { ...action.data, idempotencyKey } })).id;
        return action.data.decision === "Accepted" && onAccept ? onAccept(perform) : perform();
      }
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
  onApply: ApplyWording,
  onApplyBatch: (perform: () => Promise<string>) => Promise<string>,
) {
  const queueTrigger = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState(0),
    [view, setView] = useState<
      | { type: "queue" }
      | { type: "task"; id: string; path?: WordingPath }
      | { type: "launch"; path: WordingPath }
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
  const taskReview = view?.type === "task" && (
    <Review
      key={view.id}
      id={view.id}
      current={detail}
      busy={busy}
      inline={Boolean(view.path)}
      onApply={onApply}
      returnFocusRef={queueTrigger}
      onClose={close}
      onBack={() => setView({ type: "queue" })}
      onManual={(path) => {
        close();
        onManual(path);
      }}
      onGenerate={(path) => setView({ type: "launch", path })}
    />
  );
  return {
    configured: Boolean(list.data?.configured),
    launch: (path: WordingPath) => setView({ type: "launch", path }),
    path: view && "path" in view ? view.path : undefined,
    contentId:
      view && "path" in view && view.path && "contentId" in view.path
        ? view.path.contentId
        : undefined,
    panel: view?.type === "task" && view.path ? taskReview : null,
    inlineFor: (path: WordingPath) =>
      view?.type === "launch" && canonicalJson(view.path) === canonicalJson(path) ? (
        <Launch
          key={canonicalJson(path)}
          detail={detail}
          path={path}
          busy={busy}
          inline
          onClose={close}
          onSaved={(id) => setView({ type: "task", id, path })}
        />
      ) : null,
    queueButton: (
      <>
        {Boolean(list.data?.items.length || offset) && (
          <Button ref={queueTrigger} variant="outline" onClick={() => setView({ type: "queue" })}>
            Wording choices
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
        {view?.type === "queue" && (
          <EvidenceDialog
            title="Wording choices"
            description="Edit the suggestions and apply one choice per field."
            onClose={close}
            returnFocusRef={queueTrigger}
          >
            <div className="space-y-4">
              <WordingBulk
                draftId={detail.draft.id}
                revision={detail.draft.revision}
                busy={busy}
                onApply={onApplyBatch}
                onReview={(id) => setView({ type: "task", id })}
              />
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
                      {item.reviewState ? `Review ${item.reviewState}` : "No suggestion saved"}
                    </Badge>
                  </div>
                  <p className="text-sm">{item.stage}</p>
                  <Button variant="outline" onClick={() => setView({ type: "task", id: item.id })}>
                    Open {item.reviewState === "Pending" ? "choice" : "record"}
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
                    Previous choices
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!list.data?.hasMore}
                    onClick={() => setOffset(offset + 50)}
                  >
                    Next choices
                  </Button>
                </div>
              )}
            </div>
          </EvidenceDialog>
        )}
        {view?.type === "task" && !view.path && taskReview}
      </>
    ),
  };
}
function WordingSurface({
  inline = false,
  title,
  description,
  onClose,
  pending = false,
  children,
  returnFocusRef,
}: {
  inline?: boolean;
  title: string;
  description: string;
  onClose: () => void;
  pending?: boolean;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (inline) heading.current?.focus();
  }, [inline]);
  if (!inline)
    return (
      <EvidenceDialog
        title={title}
        description={description}
        onClose={onClose}
        pending={pending}
        returnFocusRef={returnFocusRef}
        wide
      >
        {children}
      </EvidenceDialog>
    );
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-5 rounded-md border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={id} ref={heading} tabIndex={-1} className="font-editorial text-2xl outline-none">
          {title}
        </h2>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Keep editing
        </Button>
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
function Launch({
  detail,
  path,
  busy,
  onClose,
  onSaved,
  inline = false,
}: {
  inline?: boolean;
  detail: ResumeDetail;
  path: WordingPath;
  busy: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [ai, setAi] = useState<AiSelection>();
  const [goal, setGoal] = useState(
      "Use the posting’s terminology where the selected evidence supports it.",
    ),
    action = useAction(onSaved);
  const target = captureWordingTarget(detail.draft.data, detail.graph, path);
  return (
    <WordingSurface
      inline={inline}
      title="Suggest wording"
      description="Review a change to this wording using the saved posting and selected evidence."
      onClose={onClose}
      pending={action.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate({
            type: "generate",
            data: { ai, draftId: detail.draft.id, revision: detail.draft.revision, path, goal },
          });
        }}
      >
        <AiSelector value={ai} onChange={setAi} />
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
          {target.sectionType} / {target.field}
        </p>
        <p className="whitespace-pre-wrap break-words text-base leading-6">
          {target.content.wording}
        </p>
        <p className="text-sm text-muted-foreground">
          The model receives this wording, its {target.content.evidence.length} selected evidence
          items and the job description. Other entry values are excluded.
        </p>
        <EvidenceLinks value={target.content.evidence} />

        <p className="text-sm">
          Review the wording, meaning, and supporting evidence before applying the suggestion.
        </p>
        <Failure error={action.error} />
        {busy && (
          <p role="status" className="text-sm text-warning">
            Finish saving or recovering this résumé before continuing.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={action.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || action.isPending || !goal.trim()}>
            {action.isPending ? "Starting…" : "Generate wording"}
          </Button>
        </div>
      </form>
    </WordingSurface>
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
        <p className="text-sm">No supporting evidence was selected for this wording.</p>
      )}
      {input.evidence.map((item) => (
        <article
          key={`${item.claimId}:${item.evidenceRevisionId}`}
          className="space-y-3 rounded-sm border p-5"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {proposed.some(
                (ref) => ref.claimId === item.claimId && ref.revisionId === item.evidenceRevisionId,
              )
                ? "Used by suggestion"
                : "Not used by suggestion"}
            </Badge>
            {item.archived && <Badge variant="outline">In Trash</Badge>}
            {item.currentRevisionId !== item.evidenceRevisionId && (
              <Badge variant="outline">Older saved version</Badge>
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
                <dt className="text-muted-foreground">Context at generation</dt>
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
              </dl>
            </details>
          ))}
        </article>
      ))}
      {input.evidence.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
            View evidence and sources
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
  inline = false,
  onApply,
  returnFocusRef,
}: {
  inline?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onApply: ApplyWording;
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
  });
  const detail = result.data,
    proposal = detail?.proposal,
    input = detail?.task.input,
    payload = proposal?.payload;
  const [edited, setEdited] = useState<string | null>(null);
  const action = useAction(undefined, async (perform) => {
    if (!input || !payload) throw new Error("The exact proposal is no longer available.");
    return onApply(input, { ...payload, wording: edited ?? payload.wording }, perform);
  });
  let currentTarget: ReturnType<typeof captureWordingTarget> | null = null;
  if (input) {
    try {
      currentTarget = captureWordingTarget(current.draft.data, current.graph, input.target.path);
    } catch {
      // Removed or incompatible fields cannot receive an old suggestion.
    }
  }
  const targetPresent = currentTarget !== null;
  const targetChanged = Boolean(
    proposal?.state !== "Accepted" &&
      proposal?.state !== "Rejected" &&
      input &&
      (!currentTarget || canonicalJson(currentTarget) !== canonicalJson(input.target)),
  );
  return (
    <WordingSurface
      inline={inline}
      title="Review suggested wording"
      description="Review and edit the suggestion before applying it to this résumé."
      onClose={onClose}
      pending={action.isPending}
      returnFocusRef={returnFocusRef}
    >
      <div className="space-y-5">
        <Button className="self-start" variant="ghost" disabled={action.isPending} onClick={onBack}>
          All wording choices
        </Button>
        <Failure error={result.error} />
        <Failure error={action.error} />
        {result.isPending && <p role="status">Loading choice…</p>}
        {result.error && <Button onClick={() => void result.refetch()}>Retry choice</Button>}
        {detail && input && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Generation{" "}
                {detail.operation?.state === "Pending" ? "Queued" : detail.operation?.state}
              </Badge>
              <Badge variant="outline">
                {proposal ? `Review ${proposal.state}` : "No suggestion saved"}
              </Badge>
            </div>
            <p className="flex items-center gap-2 text-sm" role="status">
              {active(detail.operation?.state) && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
              {detail.operation?.stage} · attempt {detail.task.attempts} of 3
            </p>
            <p className="eyebrow">
              {input.target.sectionType} / {input.target.field}
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
            {(detail.staleReasons.length > 0 || targetChanged) && (
              <div className="space-y-2 rounded-sm border border-warning bg-warning/5 p-4 text-sm">
                <p className="font-semibold">
                  {proposal?.state === "Pending" ? "Wording inputs changed" : "Inputs changed"}
                </p>
                {targetChanged && (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                      Compare target
                    </summary>
                    <div className="space-y-4">
                      <p className="whitespace-pre-wrap break-words">
                        At generation: {input.target.content.wording}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        Current: {currentTarget?.content.wording ?? "Wording removed"}
                      </p>
                    </div>
                  </details>
                )}
                {detail.staleReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                <p>
                  {proposal?.state === "Pending"
                    ? "Generate wording from the current inputs or edit manually before applying."
                    : "This historical record retains its original inputs and decision."}
                </p>
              </div>
            )}
            {payload && (
              <>
                <div className="grid items-start gap-4 md:grid-cols-2">
                  {[
                    { label: "Original wording", text: input.target.content.wording },
                    { label: "Suggested wording", text: payload.wording },
                  ].map((item) => (
                    <section
                      key={item.label}
                      className="min-w-0 space-y-5 rounded-lg border bg-card p-6"
                    >
                      <h3 className="eyebrow">{item.label}</h3>
                      {item.label === "Suggested wording" && proposal?.state === "Pending" ? (
                        <Textarea
                          aria-label="Edit suggested wording"
                          maxLength={10000}
                          value={edited ?? item.text}
                          onChange={(event) => setEdited(event.target.value)}
                        />
                      ) : (
                        <p className="text-base leading-6 whitespace-pre-wrap break-words">
                          {item.text}
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                <section className="space-y-3 rounded-lg border p-6">
                  <h3 className="font-editorial text-2xl">Meaning review</h3>
                  <Badge variant="outline">AI assessment: {payload.meaning.assessment}</Badge>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {payload.meaning.explanation}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{payload.reason}</p>
                  <p className="text-sm text-muted-foreground">
                    This assessment is a suggestion. Confirm that the complete wording stays within
                    the supporting evidence.
                  </p>
                </section>
                <CapturedSupport input={input} proposed={payload.evidence} />
                {payload.passages.map((passage) => (
                  <article className="space-y-2" key={`${passage.start}:${passage.end}`}>
                    <blockquote className="border-l-2 border-primary bg-muted p-4 whitespace-pre-wrap break-words">
                      {passage.quote}
                    </blockquote>
                    <p className="text-xs text-muted-foreground">
                      Posting lines {input.snapshot.text.slice(0, passage.start).split("\n").length}
                      –{input.snapshot.text.slice(0, passage.end).split("\n").length}
                    </p>
                  </article>
                ))}
              </>
            )}
            {proposal?.state === "Rejected" && (
              <p className="rounded-sm border p-4 text-sm">
                Choice dismissed. Your résumé is unchanged.
              </p>
            )}
            {proposal?.state === "Accepted" && (
              <p className="rounded-sm border border-primary p-4 text-sm" role="status">
                Wording applied to this résumé.
              </p>
            )}
            {busy && (
              <p role="status" className="text-sm">
                Finish saving or recovering this résumé before applying wording.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              {!proposal &&
                detail.configured &&
                detail.task.attempts < 3 &&
                ["Failed", "Cancelled"].includes(detail.operation?.state ?? "") && (
                  <Button
                    variant="outline"
                    disabled={
                      busy || action.isPending || detail.staleReasons.length > 0 || targetChanged
                    }
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
                  Dismiss choice
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
                    disabled={
                      busy || action.isPending || detail.staleReasons.length > 0 || targetChanged
                    }
                    onClick={() =>
                      action.mutate({
                        type: "review",
                        data: {
                          id: proposal.id,
                          revision: proposal.revision,
                          digest: proposal.digest,
                          decision: "Accepted",
                          wording: edited ?? payload?.wording,
                        },
                      })
                    }
                  >
                    {inline ? "Apply wording" : "Apply wording"}
                  </Button>
                )}
                {detail.configured && (detail.staleReasons.length > 0 || targetChanged) && (
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
              Apply or edit wording on a larger screen. You can review the complete choice here.
            </p>
          </>
        )}
      </div>
    </WordingSurface>
  );
}
