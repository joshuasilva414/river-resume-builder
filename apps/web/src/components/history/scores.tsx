import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { ScoreComparisonResults } from "~/components/scoring/comparison";
import { Button } from "~/components/ui/button";
import { compareScoringRuns, getScoringRuns } from "~/server/scoring-functions";

function CompletedRunPicker({
  checkpointId,
  label,
  value,
  onChange,
}: {
  checkpointId: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: ["scoring-comparison-runs", checkpointId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getScoringRuns({ data: { checkpointId, offset: pageParam } })),
    getNextPageParam: (page) => page.nextOffset,
  });
  const completed =
    query.data?.pages.flatMap((page) => page.items).filter((item) => item.run.completedAt) ?? [];
  return (
    <section className="min-w-0 space-y-3">
      <FormField label={`${label} scoring result`}>
        <select
          className="min-h-11 w-full min-w-0 rounded-sm border bg-background px-3"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an exact completed result</option>
          {value && !completed.some((item) => item.run.id === value) && (
            <option value={value}>Selected result {value.slice(-8)}</option>
          )}
          {completed.map(({ run }) => (
            <option key={run.id} value={run.id}>
              {run.id.slice(-8)} · {new Date(run.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </FormField>
      <p className="text-xs">
        Checkpoint {checkpointId.slice(-8)}. New results are never selected automatically.
      </p>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading completed results…</p>}
      {!query.isPending && !query.error && completed.length === 0 && (
        <p className="text-sm">No completed results in the loaded history.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh results
        </Button>
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load earlier results
          </Button>
        )}
        <Link
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-primary underline text-sm"
          to="/checkpoints/$checkpointId"
          params={{ checkpointId }}
          search={{ scores: true }}
        >
          Open {label.toLowerCase()} scoring review
        </Link>
      </div>
    </section>
  );
}
export function HistoryScores({
  beforeCheckpointId,
  afterCheckpointId,
}: {
  beforeCheckpointId: string;
  afterCheckpointId: string;
}) {
  const [beforeId, setBeforeId] = useState(""),
    [afterId, setAfterId] = useState("");
  const compared = useQuery({
    queryKey: ["scoring-comparison", beforeId, afterId],
    enabled: !!beforeId && !!afterId,
    queryFn: async () => unwrap(await compareScoringRuns({ data: { beforeId, afterId } })),
  });
  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <CompletedRunPicker
          label="Base"
          checkpointId={beforeCheckpointId}
          value={beforeId}
          onChange={setBeforeId}
        />
        <CompletedRunPicker
          label="Compare"
          checkpointId={afterCheckpointId}
          value={afterId}
          onChange={setAfterId}
        />
      </div>
      <Failure error={compared.error} />
      {beforeId && afterId && compared.isPending && (
        <p role="status">Checking exact scoring identities…</p>
      )}
      {compared.error && (
        <Button variant="outline" onClick={() => void compared.refetch()}>
          Retry result comparison
        </Button>
      )}
      {compared.data && <ScoreComparisonResults data={compared.data} />}
    </div>
  );
}
