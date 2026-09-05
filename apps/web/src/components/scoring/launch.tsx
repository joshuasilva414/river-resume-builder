import type { RetryScoringRequest, StartScoringRequest } from "@river/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { cancelDocumentOperation } from "~/server/functions";
import {
  getScoringContext,
  getScoringRun,
  getScoringRuns,
  retryScoringRun,
  scoreCheckpoint,
} from "~/server/scoring-functions";
import { ScoreComparison } from "./comparison";
import { SavedText, ScoreResults, type ScoringDetail } from "./review";

export function CheckpointScoring({
  checkpointId,
  draftId,
  onClose,
}: {
  checkpointId: string;
  draftId: string;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    [selected, setSelected] = useState<string | null>(null);
  const [request, setRequest] = useState<StartScoringRequest | null>(null);
  const [comparison, setComparison] = useState(false);
  const context = useQuery({
    queryKey: ["scoring-context", checkpointId],
    queryFn: async () => unwrap(await getScoringContext({ data: { id: checkpointId } })),
    refetchInterval: (query) => (query.state.data?.documentActive ? 5000 : false),
  });
  const runs = useInfiniteQuery({
    queryKey: ["scoring-runs", checkpointId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getScoringRuns({ data: { checkpointId, offset: pageParam } })),
    getNextPageParam: (page) => page.nextOffset,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((item) => ["Pending", "Running"].includes(item.operation.state)),
      )
        ? 3000
        : false,
  });
  const rows = runs.data?.pages.flatMap((page) => page.items) ?? [];
  const firstId = rows[0]?.run.id;
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [firstId, selected]);
  const detail = useQuery({
    queryKey: ["scoring-run", selected],
    enabled: !!selected,
    queryFn: async () => unwrap(await getScoringRun({ data: { id: selected ?? "" } })),
    refetchInterval: (query) =>
      query.state.data?.attempts.some(
        (attempt) =>
          attempt.operation.id === query.state.data?.run.operationId &&
          ["Pending", "Running"].includes(attempt.operation.state),
      )
        ? 3000
        : false,
  });
  const start = useMutation({
    mutationFn: async () => {
      if (!context.data) throw new Error("Scoring input is not ready.");
      const payload = request ?? {
        checkpointId,
        revision: context.data.revision,
        idempotencyKey: crypto.randomUUID(),
      };
      setRequest(payload);
      return unwrap(await scoreCheckpoint({ data: payload }));
    },
    onSuccess: (result) => {
      setRequest(null);
      setSelected(result.id);
      void client.invalidateQueries({ queryKey: ["scoring-runs", checkpointId] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["scoring-context", checkpointId] });
      void client.invalidateQueries({ queryKey: ["scoring-runs", checkpointId] });
    },
  });
  const setup = context.data;
  return (
    <EvidenceDialog
      title="Checkpoint scores"
      description={`Checkpoint ${checkpointId.slice(-8)}. Scoring uses the complete saved text and its exact posting snapshot.`}
      onClose={onClose}
      pending={start.isPending}
      wide
    >
      <div
        className={
          selected
            ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            : "mx-auto w-full max-w-2xl space-y-6"
        }
      >
        <div className="min-w-0 space-y-5">
          <section className="space-y-5 rounded-md border bg-card p-5 md:p-6">
            <h2 className="font-editorial text-2xl">Score this checkpoint</h2>
            <Failure error={context.error} />
            {context.isPending && <p role="status">Loading exact scoring input…</p>}
            {context.error && (
              <Button variant="outline" onClick={() => void context.refetch()}>
                Retry input inspection
              </Button>
            )}
            {setup && (
              <>
                <p className="eyebrow break-all">Posting {setup.snapshotId.slice(-8)}</p>
                {setup.preflight.inputs.map((input) => (
                  <div key={input.field} className="space-y-1">
                    <p className="font-mono text-xs">
                      {input.label}:{" "}
                      {input.field === "resumeText" && setup.resumeText === null
                        ? "Unavailable"
                        : input.characters.toLocaleString()}{" "}
                      / {input.limit.toLocaleString()} characters
                    </p>
                    {input.issue &&
                      !(input.field === "resumeText" && setup.resumeText === null) && (
                        <p className="text-sm text-muted-foreground">{input.issue}</p>
                      )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Limits use UTF-16 string units. River submits the complete saved inputs to{" "}
                  {setup.providerOrigin ?? "the configured score provider"}.
                </p>
                {setup.resumeText !== null && (
                  <SavedText title="View complete résumé text" text={setup.resumeText} />
                )}
                {setup.jobDescription !== null && (
                  <SavedText title="View exact posting" text={setup.jobDescription} />
                )}
                {!setup.configured && (
                  <p className="border-l-2 border-warning bg-warning/10 p-3 text-sm">
                    Scoring is unavailable. Saved results remain reviewable; checkpoint review and
                    export are available.
                  </p>
                )}
                {!setup.documentReady && (
                  <p className="text-sm text-muted-foreground">
                    A complete validated checkpoint document is required. Review or retry its
                    document job before scoring.
                  </p>
                )}
                <Failure error={start.error} />
                <Button
                  disabled={
                    start.isPending ||
                    (!request &&
                      (!setup.configured || !setup.documentReady || !setup.preflight.allowed))
                  }
                  onClick={() => start.mutate()}
                >
                  {start.isPending
                    ? "Starting scoring…"
                    : start.error
                      ? "Retry scoring command"
                      : "Score checkpoint"}
                </Button>
                {request && start.error && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRequest(null);
                      start.reset();
                    }}
                  >
                    Review refreshed input
                  </Button>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              The provider returns all six simulations together. A successful score does not
              acknowledge evidence issues or authorize export.
            </p>
          </section>
          <section className="space-y-4 rounded-md border bg-card p-5 md:p-6">
            <h2 className="font-editorial text-2xl">Scoring history</h2>
            <Failure error={runs.error} />
            {runs.isPending && <p role="status">Loading runs…</p>}
            {runs.error && (
              <Button variant="outline" onClick={() => void runs.refetch()}>
                Retry history
              </Button>
            )}
            {rows.length === 0 && !runs.isPending && (
              <p className="text-sm">This checkpoint has no scoring runs.</p>
            )}
            {rows.map(({ run, operation }) => (
              <Button
                key={run.id}
                variant={selected === run.id ? "secondary" : "outline"}
                className="h-auto min-h-11 w-full justify-start whitespace-normal p-3 text-left"
                onClick={() => setSelected(run.id)}
                aria-pressed={selected === run.id}
              >
                <span className="grid gap-1">
                  <span>
                    Result {run.id.slice(-8)} · {run.completedAt ? "Complete" : operation.state}
                  </span>
                  <span className="text-xs font-normal">
                    {new Date(run.createdAt).toLocaleString()} · Attempt {run.attempts} / 3
                  </span>
                </span>
              </Button>
            ))}
            {runs.hasNextPage && (
              <Button
                variant="outline"
                disabled={runs.isFetchingNextPage}
                onClick={() => void runs.fetchNextPage()}
              >
                Load earlier runs
              </Button>
            )}
            {detail.data?.run.completedAt && (
              <Button variant="outline" onClick={() => setComparison(true)}>
                Compare results
              </Button>
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-5">
          <Failure error={detail.error} />
          {selected && detail.isPending && <p role="status">Loading selected scoring run…</p>}
          {detail.error && (
            <Button variant="outline" onClick={() => void detail.refetch()}>
              Retry selected result
            </Button>
          )}
          {detail.data && (
            <>
              <RunStatus
                key={detail.data.run.id}
                detail={detail.data}
                runtimeConfigured={setup?.runtimeConfigured ?? false}
              />
              <ScoreResults key={detail.data.run.id} detail={detail.data} />
              <SavedText
                title="Input, provider observation and attempt context"
                text={JSON.stringify(
                  {
                    runId: detail.data.run.id,
                    checkpointId: detail.data.run.checkpointId,
                    snapshotId: detail.data.run.snapshotId,
                    profile: detail.data.run.profile,
                    input: detail.data.run.input,
                    attempts: detail.data.attempts,
                  },
                  null,
                  2,
                )}
              />
            </>
          )}
        </div>
      </div>
      {comparison && detail.data?.run.completedAt && (
        <ScoreComparison
          current={detail.data}
          draftId={draftId}
          onClose={() => setComparison(false)}
        />
      )}
    </EvidenceDialog>
  );
}
function RunStatus({
  detail,
  runtimeConfigured,
}: {
  detail: ScoringDetail;
  runtimeConfigured: boolean;
}) {
  const client = useQueryClient(),
    { run } = detail,
    current = detail.attempts.find((value) => value.operation.id === run.operationId);
  const [request, setRequest] = useState<
    | { type: "retry"; payload: RetryScoringRequest }
    | { type: "cancel"; payload: { operationId: string; idempotencyKey: string } }
    | null
  >(null);
  const [now, setNow] = useState(Date.now()),
    retryAt = current?.attempt.failure?.retryAt ?? 0;
  useEffect(() => {
    if (retryAt <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(60000, retryAt - now));
    return () => clearTimeout(timer);
  }, [now, retryAt]);
  const mutation = useMutation({
    mutationFn: async (type: "retry" | "cancel") => {
      const action =
        request ??
        (type === "retry"
          ? {
              type,
              payload: { id: run.id, revision: run.revision, idempotencyKey: crypto.randomUUID() },
            }
          : {
              type,
              payload: { operationId: run.operationId, idempotencyKey: crypto.randomUUID() },
            });
      setRequest(action);
      if (action.type === "retry") return unwrap(await retryScoringRun({ data: action.payload }));
      await cancelDocumentOperation({ data: action.payload }).then(unwrap);
      return null;
    },
    onSuccess: () => {
      setRequest(null);
      void client.invalidateQueries({ queryKey: ["scoring-run", run.id] });
      void client.invalidateQueries({ queryKey: ["scoring-runs", run.checkpointId] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["scoring-run", run.id] });
    },
  });
  const active = current && ["Pending", "Running"].includes(current.operation.state);
  return (
    <section className="space-y-4 rounded-md border bg-card p-5 md:p-6">
      <h2 className="font-editorial text-2xl">Result {run.id.slice(-8)}</h2>
      <p className="text-sm" role="status">
        {mutation.isPending && request?.type === "cancel"
          ? "Cancel requested…"
          : current?.operation.stage}{" "}
        · Attempt {run.attempts} of 3
      </p>
      {run.completedAt && (
        <p className="text-sm">Completed {new Date(run.completedAt).toLocaleString()}</p>
      )}
      {current?.operation.failure && (
        <p className="text-sm text-destructive">{current.operation.failure}</p>
      )}
      {run.result && !run.completedAt && (
        <p className="text-sm">
          A complete provider response is saved. Retry publication to recover it without another
          provider submission.
        </p>
      )}
      {current?.operation.state === "Cancelled" && (
        <p className="text-sm">
          Cancelled in River. An already dispatched provider request may still finish; late
          responses cannot publish this run.
        </p>
      )}
      {!active && !run.completedAt && run.attempts >= 3 && (
        <p className="text-sm">
          All three attempts have been used. Review the failure and captured input before starting a
          new run.
        </p>
      )}
      {retryAt > now && (
        <p className="text-sm">
          Provider retry available after {new Date(retryAt).toLocaleString()}.
        </p>
      )}
      <Failure error={mutation.error} />
      {request && mutation.error ? (
        <div className="flex flex-wrap gap-3">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate(request.type)}>
            Retry {request.type} command
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRequest(null);
              mutation.reset();
            }}
          >
            Review refreshed state
          </Button>
        </div>
      ) : (
        <>
          {active && (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("cancel")}
            >
              Cancel request
            </Button>
          )}
          {!active && !run.completedAt && run.attempts < 3 && (
            <Button
              variant="outline"
              disabled={!runtimeConfigured || mutation.isPending || retryAt > now}
              onClick={() => mutation.mutate("retry")}
            >
              {run.result ? "Recover saved result" : "Retry scoring"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
