import type { RetryScoringRequest, StartScoringRequest } from "@river/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
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
import { ScoringAllowance, useScoringAllowance } from "./allowance";
import { ScoreComparison } from "./comparison";
import { ScoreResults, type ScoringDetail } from "./review";

function useContext(checkpointId: string) {
  return useQuery({
    queryKey: ["scoring-context", checkpointId],
    queryFn: async () => unwrap(await getScoringContext({ data: { id: checkpointId } })),
    refetchInterval: (query) => (query.state.data?.documentActive ? 5000 : false),
  });
}

export function CheckpointScoring({
  checkpointId,
  onClose,
  onStarted,
}: {
  checkpointId: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const client = useQueryClient(),
    context = useContext(checkpointId),
    allowance = useScoringAllowance();
  const [request, setRequest] = useState<StartScoringRequest | null>(null);
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
    onSuccess: () => {
      setRequest(null);
      void client.invalidateQueries({ queryKey: ["scoring-allowance"] });
      void client.invalidateQueries({ queryKey: ["scoring-runs", checkpointId] });
      onStarted();
      onClose();
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["scoring-context", checkpointId] });
    },
  });
  const setup = context.data;
  const ready =
    setup?.configured &&
    setup.documentReady &&
    setup.preflight.allowed &&
    (allowance.data?.exempt || (allowance.data?.remaining ?? 0) > 0);
  return (
    <EvidenceDialog
      title="Score this résumé"
      description="Uses the complete text of this saved version and its job posting."
      onClose={onClose}
      pending={start.isPending}
      className="sm:max-w-[600px]"
    >
      <div className="space-y-6">
        <Failure error={context.error} />
        {context.isPending && <p role="status">Checking readiness…</p>}
        {context.error && (
          <Button variant="outline" onClick={() => void context.refetch()}>
            Retry
          </Button>
        )}
        {setup && (
          <>
            <p className="text-sm">
              {!setup.configured
                ? "Scoring is unavailable. You can still review and export this résumé."
                : !setup.documentReady
                  ? "Prepare the PDF for this saved version before scoring."
                  : "Ready to score this saved résumé against its job posting."}
            </p>
            {setup.preflight.inputs
              .filter(
                (input) =>
                  input.issue && !(input.field === "resumeText" && setup.resumeText === null),
              )
              .map((input) => (
                <p key={input.field} className="text-sm text-destructive">
                  {input.issue}
                </p>
              ))}
          </>
        )}
        <ScoringAllowance compact />
        <Failure error={start.error} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={() => start.mutate()} disabled={start.isPending || (!request && !ready)}>
            {start.isPending ? "Starting…" : start.error ? "Retry" : "Score"}
          </Button>
        </div>
        {request && start.error && (
          <Button
            variant="ghost"
            onClick={() => {
              setRequest(null);
              start.reset();
            }}
          >
            Use refreshed input
          </Button>
        )}
      </div>
    </EvidenceDialog>
  );
}

export function ScoringHistory({
  checkpointId,
  draftId,
}: {
  checkpointId: string;
  draftId: string;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [comparison, setComparison] = useState(false);
  const context = useContext(checkpointId);
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
    if (firstId) setSelected(firstId);
  }, [firstId]);
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
  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="space-y-4">
        <h2 className="font-editorial text-2xl">Scoring history</h2>
        <Failure error={runs.error} />
        {runs.isPending && <p role="status">Loading scores…</p>}
        {runs.error && (
          <Button variant="outline" onClick={() => void runs.refetch()}>
            Retry
          </Button>
        )}
        {!rows.length && !runs.isPending && (
          <p className="text-sm text-muted-foreground">No scores for this saved version yet.</p>
        )}
        {rows.map(({ run, operation }) => (
          <Button
            key={run.id}
            variant={selected === run.id ? "secondary" : "ghost"}
            className="h-auto min-h-11 w-full justify-start whitespace-normal p-3 text-left"
            onClick={() => setSelected(run.id)}
            aria-pressed={selected === run.id}
          >
            <span className="grid gap-1">
              <span>{run.completedAt ? "Complete" : operation.state}</span>
              <span className="text-xs font-normal">
                {new Date(run.createdAt).toLocaleString()}
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
            Earlier scores
          </Button>
        )}
        {detail.data?.run.completedAt && (
          <Button variant="outline" onClick={() => setComparison(true)}>
            Compare results
          </Button>
        )}
      </section>
      <section className="min-w-0 space-y-5">
        <Failure error={detail.error} />
        {selected && detail.isPending && <p role="status">Loading score…</p>}
        {detail.error && (
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        )}
        {detail.data && (
          <>
            <RunStatus
              key={detail.data.run.id}
              detail={detail.data}
              runtimeConfigured={context.data?.runtimeConfigured ?? false}
            />
            <ScoreResults key={detail.data.run.id} detail={detail.data} />
          </>
        )}
      </section>
      {comparison && detail.data?.run.completedAt && (
        <ScoreComparison
          current={detail.data}
          draftId={draftId}
          onClose={() => setComparison(false)}
        />
      )}
    </div>
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
      void client.invalidateQueries({ queryKey: ["scoring-allowance"] });
      void client.invalidateQueries({ queryKey: ["scoring-run", run.id] });
      void client.invalidateQueries({ queryKey: ["scoring-runs", run.checkpointId] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["scoring-run", run.id] });
    },
  });
  const active = current && ["Pending", "Running"].includes(current.operation.state);
  if (run.completedAt) return null;
  return (
    <section className="space-y-4 py-3">
      <p className="flex items-center gap-2 text-sm" role="status">
        {active && <LoaderCircle className="size-4 animate-spin" />}
        {mutation.isPending && request?.type === "cancel"
          ? "Cancel requested…"
          : active
            ? "Scoring résumé…"
            : current?.operation.state === "Cancelled"
              ? "Scoring cancelled."
              : "Scoring failed."}
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
        <p className="text-sm">Start a new score request when you are ready to try again.</p>
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
              void client.invalidateQueries({ queryKey: ["scoring-allowance"] });
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
