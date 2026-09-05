import type {
  RetrySourceAiRequest,
  ReviewSourceCandidateRequest,
  StartSourceAiRequest,
} from "@river/contracts";
import { canonicalJson, type EvidenceMaterialInput } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation, getSource } from "~/server/functions";
import {
  decideSourceCandidate,
  generateSourceAiTask,
  getSourceAiTask,
  getSourceAiTasks,
  previewSourceAiInput,
  retrySourceAiTask,
} from "~/server/source-ai-functions";
import { ClaimEditor } from "./claim-editor";
import { ContextSnapshot } from "./context-snapshot";
import { EvidenceDialog, Failure, FormField, selectClass, unwrap, useContexts } from "./shared";

type Detail = Extract<Awaited<ReturnType<typeof getSourceAiTask>>, { ok: true }>["value"];
type Source = {
  id: string;
  revision: number;
  currentProcessingId: string | null;
  title: string;
  state: string;
};
type Action =
  | { type: "generate"; data: Omit<StartSourceAiRequest, "idempotencyKey"> }
  | { type: "retry"; data: Omit<RetrySourceAiRequest, "idempotencyKey"> }
  | { type: "review"; data: Omit<ReviewSourceCandidateRequest, "idempotencyKey"> }
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
        return unwrap(await generateSourceAiTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "retry")
        return unwrap(await retrySourceAiTask({ data: { ...action.data, idempotencyKey } })).id;
      if (action.type === "review")
        return unwrap(await decideSourceCandidate({ data: { ...action.data, idempotencyKey } })).id;
      unwrap(await cancelDocumentOperation({ data: { ...action.data, idempotencyKey } }));
      return action.data.operationId;
    },
    onSuccess: async (id, action) => {
      if (action.type === "review" && action.data.decision === "Rejected")
        client.setQueriesData<Detail>({ queryKey: ["source-ai", "detail"] }, (value) =>
          value
            ? {
                ...value,
                candidates: value.candidates.map((candidate) =>
                  candidate.id === action.data.id
                    ? { ...candidate, payload: null, state: "Rejected" }
                    : candidate,
                ),
              }
            : value,
        );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["source-ai"] }),
        client.invalidateQueries({ queryKey: ["evidence"] }),
      ]);
      onSaved?.(id);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["source-ai"] });
    },
  });
}
export function SourceAiPanel({
  source,
  processingId,
  onExtraction,
}: {
  source: Source;
  processingId: string | null;
  onExtraction: (id?: string) => void;
}) {
  const [view, setView] = useState<"launch" | "queue" | "manual" | null>(null),
    [offset, setOffset] = useState(0),
    [taskId, setTaskId] = useState<string | null>(null),
    [manualClaim, setManualClaim] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["source-ai", "list", source.id, offset],
    queryFn: async () => unwrap(await getSourceAiTasks({ data: { sourceId: source.id, offset } })),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => active(item.state)) ? 1500 : false,
  });
  const ready = source.state === "Ready" && source.currentProcessingId === processingId;
  return (
    <section className="space-y-3 border-y py-4" aria-label="Source claim assistance">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setView("manual")}>
          Write claim manually
        </Button>
        {list.data?.configured && (
          <Button size="sm" disabled={!ready} onClick={() => setView("launch")}>
            Generate claim proposals
          </Button>
        )}
        {Boolean(list.data?.items.length || offset) && (
          <Button variant="outline" size="sm" onClick={() => setView("queue")}>
            Source proposals
          </Button>
        )}
      </div>
      {list.data?.configured && !ready && (
        <p className="text-sm text-muted-foreground">
          Generation requires the current ready extraction.{" "}
          <button type="button" className="text-primary underline" onClick={() => onExtraction()}>
            View current extraction
          </button>
        </p>
      )}
      {list.error && <Failure error={list.error} />}
      {manualClaim && (
        <p role="status" className="text-sm">
          Manual Draft saved.{" "}
          <Link className="text-primary underline" to="/evidence" search={{ claimId: manualClaim }}>
            Review claim
          </Link>
        </p>
      )}
      {view === "manual" && <ClaimEditor onClose={() => setView(null)} onSaved={setManualClaim} />}
      {view === "launch" && (
        <Launch
          source={source}
          onClose={() => setView(null)}
          onSaved={(id) => {
            setTaskId(id);
            setView("queue");
          }}
        />
      )}
      {view === "queue" && (
        <EvidenceDialog
          title="Source proposals"
          description="Review each candidate before creating a Draft claim. Saved review remains available when AI is unavailable."
          onClose={() => setView(null)}
          className="sm:max-w-[792px]"
        >
          <div className="space-y-5">
            <p className="eyebrow break-words">{source.title}</p>
            <Failure error={list.error} />
            <FormField label="Generation run">
              <select
                className={selectClass}
                value={taskId ?? list.data?.items[0]?.id ?? ""}
                onChange={(event) => setTaskId(event.target.value)}
              >
                {list.data?.items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.pending + item.accepted + item.rejected} candidates · {item.state}
                  </option>
                ))}
              </select>
            </FormField>
            {(taskId ?? list.data?.items[0]?.id) && (
              <Review
                key={taskId ?? list.data?.items[0]?.id}
                id={taskId ?? list.data?.items[0]?.id ?? ""}
                onRefresh={() => setView("launch")}
                onExtraction={(id) => {
                  setView(null);
                  onExtraction(id);
                }}
              />
            )}
            {!list.isPending && !list.data?.items.length && <p>No generation runs on this page.</p>}
            {(offset > 0 || list.data?.hasMore) && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  disabled={!offset}
                  onClick={() => {
                    setOffset(Math.max(0, offset - 50));
                    setTaskId(null);
                  }}
                >
                  Previous runs
                </Button>
                <Button
                  variant="outline"
                  disabled={!list.data?.hasMore}
                  onClick={() => {
                    setOffset(offset + 50);
                    setTaskId(null);
                  }}
                >
                  Next runs
                </Button>
              </div>
            )}
          </div>
        </EvidenceDialog>
      )}
    </section>
  );
}
function Launch({
  source,
  onClose,
  onSaved,
}: {
  source: Source;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [captured] = useState(source),
    [focus, setFocus] = useState(""),
    [debouncedFocus, setDebouncedFocus] = useState(""),
    [selected, setSelected] = useState<StartSourceAiRequest["contexts"]>([]);
  const contexts = useContexts(),
    action = useAction(onSaved);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFocus(focus), 300);
    return () => clearTimeout(timer);
  }, [focus]);
  const changed =
    source.revision !== captured.revision ||
    source.state !== "Ready" ||
    source.currentProcessingId !== captured.currentProcessingId;
  const input = {
    sourceId: captured.id,
    revision: captured.revision,
    processingId: captured.currentProcessingId ?? "",
    contexts: selected,
    focus: debouncedFocus,
  };
  const preview = useQuery({
    queryKey: ["source-ai", "preflight", input],
    enabled: Boolean(captured.currentProcessingId),
    queryFn: async () =>
      unwrap(await previewSourceAiInput({ data: { ...input, idempotencyKey: "preflight" } })),
    retry: false,
  });
  const text = useQuery({
    queryKey: ["source", captured.id, captured.currentProcessingId],
    queryFn: async () =>
      unwrap(
        await getSource({
          data: { id: captured.id, processingId: captured.currentProcessingId ?? undefined },
        }),
      ),
  });
  return (
    <EvidenceDialog
      title="Generate claim proposals"
      description="Use this complete extraction and the context you select. Every proposed claim requires individual review."
      onClose={onClose}
      dirty={Boolean(focus || selected.length)}
      pending={action.isPending}
      className="sm:max-w-[676px]"
    >
      <div className="space-y-5">
        <p className="font-semibold">{captured.title}</p>
        <p className="break-all font-mono text-xs">
          Processing result {captured.currentProcessingId}
        </p>
        <Button asChild variant="outline">
          <a href={`/api/v1/sources/${captured.id}?download`}>Download original</a>
        </Button>
        <details className="rounded-sm border p-4">
          <summary className="cursor-pointer text-sm">Complete extracted text</summary>
          <Failure error={text.error} />
          <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
            {text.data?.extraction?.text ?? "Loading extraction…"}
          </p>
        </details>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">
            Optional context · {selected.length}/10
          </legend>
          <Failure error={contexts.error} />
          <div className="max-h-72 space-y-3 overflow-auto">
            {contexts.data?.map((context) => {
              const checked = selected.some((item) => item.id === context.id);
              return (
                <div key={context.id} className="space-y-2">
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      disabled={!checked && selected.length >= 10}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, { id: context.id, revisionId: context.revisionId }]
                            : selected.filter((item) => item.id !== context.id),
                        )
                      }
                    />
                    {context.data.label}
                  </label>
                  <ContextSnapshot data={context.data} revisionId={context.revisionId} />
                </div>
              );
            })}
          </div>
          {!contexts.data?.length && !contexts.isPending && (
            <p className="text-sm text-muted-foreground">
              No saved contexts. You can generate from this source alone.
            </p>
          )}
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear context selection
            </Button>
          )}
        </fieldset>
        <FormField label="Extraction focus (optional)">
          <Textarea
            maxLength={2000}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            className="min-h-[88px]"
            placeholder="For example, identify the contributions explicitly described in these notes."
          />
        </FormField>
        <div className="rounded-sm border p-4 text-sm" role="status">
          {preview.isFetching || focus !== debouncedFocus
            ? "Checking complete input…"
            : preview.data
              ? `${preview.data.characters.toLocaleString()} / ${preview.data.limit.toLocaleString()} UTF-16 units`
              : "Input size unavailable."}
          <p className="mt-2 text-muted-foreground">
            Includes complete extracted text, selected context, and focus. Nothing is truncated or
            split.
          </p>
          {preview.data && !preview.data.allowed && (
            <p className="mt-2 text-destructive">
              This input exceeds the limit. Remove optional context or use a smaller source. Manual
              claim entry remains available.
            </p>
          )}
        </div>
        {changed && (
          <p role="alert" className="text-sm text-destructive">
            The source changed. Close and reopen generation from the current ready extraction.
          </p>
        )}
        <Failure error={preview.error ?? action.error} />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" disabled={action.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              action.isPending ||
              changed ||
              !preview.data?.allowed ||
              preview.isFetching ||
              Boolean(preview.error) ||
              focus !== debouncedFocus
            }
            onClick={() => action.mutate({ type: "generate", data: input })}
          >
            {action.isPending ? "Queuing…" : "Generate proposals"}
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
function Review({
  id,
  onRefresh,
  onExtraction,
}: {
  id: string;
  onRefresh: () => void;
  onExtraction: (id: string) => void;
}) {
  const [filter, setFilter] = useState("All"),
    [selectedId, setSelected] = useState<string | null>(null),
    [manual, setManual] = useState<{
      id: string;
      digest: string;
      material: EvidenceMaterialInput;
    } | null>(null),
    [manualClaim, setManualClaim] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["source-ai", "detail", id],
    queryFn: async () => unwrap(await getSourceAiTask({ data: { id } })),
    refetchInterval: (query) => (active(query.state.data?.operation?.state) ? 1500 : false),
  });
  const action = useAction(),
    detail = query.data,
    selected = detail?.candidates.find((item) => item.id === selectedId);
  const currentContexts = useContexts();
  const reviewRoot = useRef<HTMLDivElement>(null);
  const chooseCandidate = (candidateId: string | null) => {
    setSelected(candidateId);
    action.reset();
    reviewRoot.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
  };
  const currentSource = useQuery({
    queryKey: ["source", detail?.task.input.source.id, "current"],
    enabled: Boolean(detail?.task.input.source.id),
    queryFn: async () =>
      unwrap(await getSource({ data: { id: detail?.task.input.source.id ?? "" } })),
  });
  if (!detail)
    return (
      <>
        <Failure error={query.error} />
        <p role="status">Loading source proposals…</p>
      </>
    );
  const input = detail.task.input,
    operation = detail.operation;
  const pending = detail.candidates.filter((item) => item.state === "Pending");
  return (
    <div ref={reviewRoot} className="space-y-5">
      <Failure error={query.error ?? action.error} />
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          Generation {operation?.state === "Pending" ? "Queued" : operation?.state}
        </Badge>
        <Badge variant="outline">{pending.length} pending</Badge>
      </div>
      <p role="status" className="text-sm">
        {operation?.stage}
      </p>
      {operation?.failure && (
        <p role="alert" className="text-sm text-destructive">
          {operation.failure}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer">Generation inputs and identity</summary>
        <div className="mt-3 space-y-2 break-all font-mono">
          <p>
            {input.source.processingId} · {input.source.parser} {input.source.parserVersion}
          </p>
          <p>Input SHA-256 {input.source.processingDigest}</p>
          <p>
            {detail.task.profile.contract} · {detail.task.profile.model}
          </p>
          <p>Attempt {detail.task.attempts} / 3</p>
          <p className="whitespace-pre-wrap font-sans">Focus: {input.focus || "None"}</p>
        </div>
      </details>
      {active(operation?.state) && operation && (
        <Button
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate({ type: "cancel", data: { operationId: operation.id } })}
        >
          Cancel generation
        </Button>
      )}
      {detail.configured &&
        operation &&
        ["Failed", "Cancelled"].includes(operation.state) &&
        detail.task.attempts < 3 &&
        !detail.staleReasons.length && (
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
      {detail.staleReasons.length > 0 && (
        <div className="space-y-3 rounded-sm border border-warning p-4 text-sm">
          <p className="font-semibold">Inputs changed</p>
          {detail.staleReasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <p>
            Pending candidates require a new generation run before acceptance. Manual edits create
            an independent Draft.
          </p>
          <details>
            <summary className="cursor-pointer text-primary">Compare changed inputs</summary>
            <Failure error={currentSource.error ?? currentContexts.error} />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="font-semibold">Reviewed inputs</p>
                <p className="break-all font-mono text-xs">
                  Source revision {input.source.revision} · {input.source.processingId}
                </p>
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                  {input.source.text}
                </p>
                {input.contexts.map((context) => (
                  <ContextSnapshot
                    key={context.id}
                    data={context.data}
                    revisionId={context.revisionId}
                  />
                ))}
              </div>
              <div className="space-y-3">
                <p className="font-semibold">Current inputs</p>
                <p className="break-all font-mono text-xs">
                  Source revision {currentSource.data?.source.revision} ·{" "}
                  {currentSource.data?.source.currentProcessingId ?? "Unavailable"}
                </p>
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                  {currentSource.data?.extraction?.text}
                </p>
                {input.contexts.map((context) => {
                  const current = currentContexts.data?.find((item) => item.id === context.id);
                  return current ? (
                    <ContextSnapshot
                      key={context.id}
                      data={current.data}
                      revisionId={current.revisionId}
                    />
                  ) : (
                    <p key={context.id}>Context unavailable: {context.data.label}</p>
                  );
                })}
              </div>
            </div>
          </details>
          {detail.configured && (
            <Button variant="outline" onClick={onRefresh}>
              Refresh generation inputs
            </Button>
          )}
        </div>
      )}
      {!selected ? (
        <>
          <FormField label="Review state">
            <select
              className={selectClass}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {["All", "Pending", "Accepted", "Rejected"].map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </FormField>
          <p className="text-sm text-muted-foreground">
            Pending {pending.length} · Accepted{" "}
            {detail.candidates.filter((item) => item.state === "Accepted").length} · Rejected{" "}
            {detail.candidates.filter((item) => item.state === "Rejected").length}
          </p>
          {detail.candidates
            .filter((item) => filter === "All" || item.state === filter)
            .map((candidate) => (
              <article key={candidate.id} className="space-y-3 rounded-sm border bg-accent/30 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="eyebrow">Candidate {candidate.ordinal + 1}</p>
                  <Badge variant="outline">{candidate.state}</Badge>
                </div>
                <p className="font-semibold whitespace-pre-wrap break-words">
                  {candidate.payload?.material.assertion ?? "Proposal content removed"}
                </p>
                {candidate.payload && (
                  <p className="text-sm text-muted-foreground">
                    {candidate.payload.material.citations.length} exact citations ·{" "}
                    {candidate.payload.material.contexts.length} contexts ·{" "}
                    {candidate.payload.questions.length} clarification questions
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    chooseCandidate(candidate.id);
                  }}
                >
                  Review {candidate.state === "Rejected" ? "decision" : "candidate"}
                </Button>
              </article>
            ))}
          {!detail.candidates.length && detail.task.completedAt !== null && (
            <div className="space-y-3">
              <p className="font-semibold">No candidates were found</p>
              <p className="text-sm">
                This completed run found no supported claims. Review the full extraction or write a
                claim manually.
              </p>
            </div>
          )}
          <Button variant="outline" onClick={() => onExtraction(input.source.processingId)}>
            View extraction
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            onClick={() => {
              chooseCandidate(null);
            }}
          >
            Return to queue
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{selected.state}</Badge>
            <p className="eyebrow">Candidate {selected.ordinal + 1}</p>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer">Candidate identity</summary>
            <p className="mt-2 break-all font-mono">{selected.id}</p>
            <p className="mt-2 break-all font-mono">SHA-256 {selected.digest}</p>
            {selected.reviewedAt && (
              <p className="mt-2">Reviewed {new Date(selected.reviewedAt).toLocaleString()}</p>
            )}
          </details>
          {selected.payload ? (
            <>
              <p className="font-sans text-xl font-semibold leading-[29px] whitespace-pre-wrap break-words">
                {selected.payload.material.assertion}
              </p>
              {selected.payload.material.citations.map((citation) => (
                <article className="space-y-3" key={`${citation.start}:${citation.end}`}>
                  <p className="text-sm font-semibold">{input.source.title}</p>
                  <blockquote className="border-l-2 border-primary bg-muted p-4 text-sm leading-5 whitespace-pre-wrap break-words">
                    {citation.quote}
                  </blockquote>
                  <p className="font-mono text-xs">
                    {citation.locators
                      .map((locator) =>
                        [
                          locator.page ? `Page ${locator.page}` : "",
                          locator.line ? `Line ${locator.line}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      )
                      .join(", ")}{" "}
                    · UTF-16 {citation.start}–{citation.end}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Locate exact quote in full extraction
                    </summary>
                    <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
                      <span>{input.source.text.slice(0, citation.start)}</span>
                      <mark>{input.source.text.slice(citation.start, citation.end)}</mark>
                      <span>{input.source.text.slice(citation.end)}</span>
                    </p>
                  </details>
                </article>
              ))}
              <Button asChild variant="outline">
                <a href={`/api/v1/sources/${input.source.id}?download`}>Download original</a>
              </Button>
              {selected.payload.material.contexts.map((ref) => {
                const context = input.contexts.find(
                  (item) => item.id === ref.id && item.revisionId === ref.revisionId,
                );
                return context ? (
                  <ContextSnapshot key={ref.id} data={context.data} revisionId={ref.revisionId} />
                ) : null;
              })}
              <div className="space-y-2 text-sm">
                <p className="font-semibold">Why this was proposed</p>
                <p className="whitespace-pre-wrap break-words">{selected.payload.explanation}</p>
                {Boolean(
                  selected.payload.metadata.label ||
                    selected.payload.metadata.tags.length ||
                    selected.payload.metadata.notes,
                ) && (
                  <details>
                    <summary className="cursor-pointer">Proposed label, tags, and notes</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {[
                        selected.payload.metadata.label,
                        selected.payload.metadata.tags.join(", "),
                        selected.payload.metadata.notes,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </p>
                  </details>
                )}
              </div>
              {selected.payload.questions.length > 0 && (
                <div className="space-y-3 rounded-sm border border-warning p-4 text-sm">
                  <p className="font-semibold">Clarification questions</p>
                  <ul className="list-disc space-y-2 pl-5">
                    {selected.payload.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                  <p>
                    These questions do not change the claim’s review state. Acceptance preserves
                    them for later source-backed answers.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm">
              Generated assertion, quotes, notes, and questions were removed. The decision record
              remains.
            </p>
          )}
          {selected.state === "Pending" && selected.payload && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Create Draft claim accepts these exact values. Edit manually creates an independent
                Draft and keeps this candidate Pending.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      type: "review",
                      data: {
                        id: selected.id,
                        revision: selected.revision,
                        digest: selected.digest,
                        decision: "Rejected",
                      },
                    })
                  }
                >
                  Reject candidate
                </Button>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => {
                    if (selected.payload)
                      setManual({
                        id: selected.id,
                        digest: selected.digest,
                        material: selected.payload.material,
                      });
                  }}
                >
                  Edit manually
                </Button>
                <Button
                  disabled={action.isPending || detail.staleReasons.length > 0}
                  onClick={() =>
                    action.mutate({
                      type: "review",
                      data: {
                        id: selected.id,
                        revision: selected.revision,
                        digest: selected.digest,
                        decision: "Accepted",
                      },
                    })
                  }
                >
                  {action.isPending ? "Saving…" : "Create Draft claim"}
                </Button>
              </div>
            </div>
          )}
          {selected.claimId && (
            <p className="text-sm">
              Draft claim created.{" "}
              <Link
                className="text-primary underline"
                to="/evidence"
                search={{ claimId: selected.claimId }}
              >
                Open claim review
              </Link>
            </p>
          )}
          {selected.state !== "Pending" && pending[0] && (
            <Button
              variant="outline"
              onClick={() => {
                chooseCandidate(pending[0]?.id ?? null);
              }}
            >
              Review next pending
            </Button>
          )}
        </>
      )}
      {manualClaim && (
        <p role="status" className="text-sm">
          Independent manual Draft saved. The original candidate remains Pending.{" "}
          <Link className="text-primary underline" to="/evidence" search={{ claimId: manualClaim }}>
            Open manual claim
          </Link>
        </p>
      )}
      {manual && (
        <ClaimEditor
          initialMaterial={manual.material}
          originCandidate={{ id: manual.id, digest: manual.digest }}
          onClose={() => setManual(null)}
          onSaved={setManualClaim}
        />
      )}
    </div>
  );
}
