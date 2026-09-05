import { scoringPlatforms } from "@river/domain";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getCheckpoints } from "~/server/checkpoint-functions";
import { compareScoringRuns, getScoringRuns } from "~/server/scoring-functions";
import { SavedText, type ScoringDetail } from "./review";

export function ScoreComparison({
  current,
  draftId,
  onClose,
}: {
  current: ScoringDetail;
  draftId: string;
  onClose: () => void;
}) {
  const [checkpointId, setCheckpointId] = useState(current.run.checkpointId),
    [beforeId, setBeforeId] = useState("");
  const checkpoints = useInfiniteQuery({
    queryKey: ["scoring-comparison-checkpoints", draftId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getCheckpoints({ data: { draftId, offset: pageParam } })),
    getNextPageParam: (page, _pages, lastPageParam) =>
      page.hasMore ? lastPageParam + 50 : undefined,
  });
  const scores = useInfiniteQuery({
    queryKey: ["scoring-comparison-runs", checkpointId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getScoringRuns({ data: { checkpointId, offset: pageParam } })),
    getNextPageParam: (page) => page.nextOffset,
  });
  const compared = useQuery({
    queryKey: ["scoring-comparison", beforeId, current.run.id],
    enabled: !!beforeId,
    queryFn: async () =>
      unwrap(await compareScoringRuns({ data: { beforeId, afterId: current.run.id } })),
  });
  const options =
    scores.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => item.run.completedAt && item.run.id !== current.run.id) ?? [];
  return (
    <EvidenceDialog
      title="Compare scoring results"
      description="Choose exact completed results. Newer runs do not replace this comparison."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <p className="text-sm">
          Compare result: {current.run.id.slice(-8)} · Checkpoint{" "}
          {current.run.checkpointId.slice(-8)} · {new Date(current.run.createdAt).toLocaleString()}
        </p>
        <Failure error={checkpoints.error} />
        <Failure error={scores.error} />
        {checkpoints.error && (
          <Button variant="outline" onClick={() => void checkpoints.refetch()}>
            Retry checkpoint choices
          </Button>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Base checkpoint
            <select
              className="min-h-11 w-full rounded-sm border bg-background px-3"
              value={checkpointId}
              onChange={(event) => {
                setCheckpointId(event.target.value);
                setBeforeId("");
              }}
            >
              {!checkpoints.data && (
                <option value={current.run.checkpointId}>Current saved checkpoint</option>
              )}
              {checkpoints.data?.pages
                .flatMap((page) => page.items)
                .map((checkpoint) => (
                  <option key={checkpoint.id} value={checkpoint.id}>
                    {checkpoint.id.slice(-8)} · Draft r{checkpoint.draftRevision} ·{" "}
                    {new Date(checkpoint.createdAt).toLocaleString()}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Base result
            <select
              className="min-h-11 w-full rounded-sm border bg-background px-3"
              value={beforeId}
              onChange={(event) => setBeforeId(event.target.value)}
            >
              <option value="">Choose a completed result</option>
              {options.map(({ run }) => (
                <option key={run.id} value={run.id}>
                  {run.id.slice(-8)} · {new Date(run.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        </div>
        {checkpoints.hasNextPage && (
          <Button
            variant="outline"
            disabled={checkpoints.isFetchingNextPage}
            onClick={() => void checkpoints.fetchNextPage()}
          >
            Load earlier checkpoints
          </Button>
        )}
        {scores.hasNextPage && (
          <Button
            variant="outline"
            disabled={scores.isFetchingNextPage}
            onClick={() => void scores.fetchNextPage()}
          >
            Load earlier results
          </Button>
        )}
        {scores.error && (
          <Button variant="outline" onClick={() => void scores.refetch()}>
            Retry result choices
          </Button>
        )}
        {scores.isPending && <p role="status">Loading completed results…</p>}
        {!scores.isPending && options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This checkpoint has no other completed scoring result. Select another saved checkpoint
            or score it first.
          </p>
        )}
        <Failure error={compared.error} />
        {compared.error && (
          <Button variant="outline" onClick={() => void compared.refetch()}>
            Retry comparison
          </Button>
        )}
        {beforeId && compared.isPending && <p role="status">Checking scoring compatibility…</p>}
        {compared.data && <ScoreComparisonResults data={compared.data} />}
      </div>
    </EvidenceDialog>
  );
}

export function ScoreComparisonResults({
  data,
}: {
  data: Extract<Awaited<ReturnType<typeof compareScoringRuns>>, { ok: true }>["value"];
}) {
  return (
    <>
      {data.comparison.compatible ? (
        <p className="text-sm text-approved">
          Reported scoring identities and posting snapshots match. Changes below use the saved
          results.
        </p>
      ) : (
        <div className="space-y-2 border-l-2 border-warning bg-warning/10 p-4">
          <h3 className="font-semibold">These results cannot be compared with deltas</h3>
          <ul className="list-disc pl-5 text-sm">
            {data.comparison.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Independent platform scores and compatible changes</caption>
        <thead>
          <tr className="border-b">
            <th className="py-3">Platform</th>
            <th>Base</th>
            <th>Compare</th>
            {data.comparison.compatible && <th>Change</th>}
          </tr>
        </thead>
        <tbody>
          {scoringPlatforms.map((platform) => {
            const a = data?.before.result?.response.results.find(
                (value) => value.system === platform,
              ),
              b = data?.after.result?.response.results.find((value) => value.system === platform),
              delta = data?.comparison.deltas?.find((value) => value.system === platform);
            return (
              <tr key={platform} className="border-b">
                <th className="py-4 pr-3 font-medium">{platform}</th>
                <td>
                  {a?.overallScore}
                  <span className="block text-xs">{a?.passesFilter ? "Pass" : "Below filter"}</span>
                </td>
                <td>
                  {b?.overallScore}
                  <span className="block text-xs">{b?.passesFilter ? "Pass" : "Below filter"}</span>
                </td>
                {delta && (
                  <td>
                    {delta.change > 0 ? "+" : ""}
                    {delta.change}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Policy: {data.comparison.policy}. Identity equality reflects provider-reported metadata; it
        does not guarantee immutable weights behind a model alias.
      </p>
      <SavedText
        title="Complete base result and scoring context"
        text={JSON.stringify(data.before, null, 2)}
      />
      <SavedText
        title="Complete compared result and scoring context"
        text={JSON.stringify(data.after, null, 2)}
      />
    </>
  );
}
