import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getCheckpoints } from "~/server/checkpoint-functions";
import { getResume, getResumes } from "~/server/composition-functions";
import { CheckpointComparison } from "./comparison";
import { RestoreCheckpoint } from "./restore";

export function CheckpointHistory({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const [selected, setSelected] = useState(draftId),
    [compare, setCompare] = useState<string | null>(null),
    [restore, setRestore] = useState<string | null>(null);
  const root = useQuery({
    queryKey: ["resumes", "detail", draftId],
    queryFn: async () => unwrap(await getResume({ data: { id: draftId } })),
  });
  const family = useInfiniteQuery({
    queryKey: ["resumes", "history-options", root.data?.draft.jobId],
    enabled: !!root.data,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await getResumes({ data: { jobId: root.data?.draft.jobId ?? null, offset: pageParam } }),
      ),
    getNextPageParam: (page, _pages, offset) => (page.hasMore ? offset + 50 : undefined),
  });
  const result = useInfiniteQuery({
    queryKey: ["checkpoints", "history", selected],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getCheckpoints({ data: { draftId: selected, offset: pageParam } })),
    getNextPageParam: (page, _pages, offset) => (page.hasMore ? offset + 50 : undefined),
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((item) => ["Pending", "Running"].includes(item.state)),
      )
        ? 3000
        : false,
  });
  const drafts = family.data?.pages.flatMap((page) => page.items) ?? [],
    current = drafts.find((draft) => draft.id === selected);
  const checkpoints = result.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <EvidenceDialog
      title="Checkpoint history"
      description="Newest first. Saved checkpoints, current drafts and exported artifacts remain separate."
      onClose={onClose}
    >
      <div className="space-y-5">
        <Failure error={root.error} />
        <Failure error={family.error} />
        {(root.error || family.error) && (
          <Button
            variant="outline"
            onClick={() => {
              void root.refetch();
              void family.refetch();
            }}
          >
            Retry branch choices
          </Button>
        )}
        <FormField label="Draft or branch for this job">
          <select
            className="min-h-11 w-full rounded-sm border bg-background px-3"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {!drafts.some((draft) => draft.id === selected) && (
              <option value={selected}>{root.data?.draft.data.name ?? "Current draft"}</option>
            )}
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.data.name}
                {draft.branchName ? ` · from ${draft.branchName}` : ""}
              </option>
            ))}
          </select>
        </FormField>
        {family.hasNextPage && (
          <Button
            variant="outline"
            disabled={family.isFetchingNextPage}
            onClick={() => void family.fetchNextPage()}
          >
            Load more drafts and branches
          </Button>
        )}
        <section className="space-y-2 rounded-md border bg-primary/5 p-4">
          <h3 className="font-semibold">Working draft{current ? ` · r${current.revision}` : ""}</h3>
          <p className="text-sm text-muted-foreground">
            This is the persisted draft. Open its editor to review local save state and capture a
            checkpoint.
          </p>
          <Link
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm text-primary underline"
            to="/resumes/$resumeId"
            params={{ resumeId: selected }}
          >
            Open editor in a new tab
          </Link>
          {current?.fromCheckpointId && (
            <p className="text-xs">
              Branched from checkpoint {current.fromCheckpointId.slice(-8)}.
            </p>
          )}
        </section>
        <Failure error={result.error} />
        {result.isPending && <p role="status">Loading chronological history…</p>}
        {result.error && (
          <Button variant="outline" onClick={() => void result.refetch()}>
            Retry history
          </Button>
        )}
        {checkpoints.map((checkpoint) => (
          <article key={checkpoint.id} className="space-y-3 border-b py-4">
            <h3 className="font-editorial text-xl">Checkpoint {checkpoint.id.slice(-8)}</h3>
            {checkpoint.label && <p className="text-sm font-medium">{checkpoint.label}</p>}
            <p className="eyebrow">
              {new Date(checkpoint.createdAt).toLocaleString()} · Captured draft r
              {checkpoint.draftRevision}
            </p>
            <p className="text-sm">
              Saved ·{" "}
              {checkpoint.state === "Succeeded"
                ? "PDF ready"
                : ["Pending", "Running"].includes(checkpoint.state)
                  ? "PDF preparing"
                  : `Document ${checkpoint.state.toLowerCase()}`}
              {checkpoint.exportedAt ? " · Exported" : ""}
              {checkpoint.scored ? " · Scored" : ""}
              {checkpoint.sourceRefined ? " · Source refined" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-primary underline"
                to="/checkpoints/$checkpointId"
                params={{ checkpointId: checkpoint.id }}
              >
                Open saved checkpoint
              </Link>
              <Button variant="outline" onClick={() => setRestore(checkpoint.id)}>
                Restore as a branch
              </Button>
              <Button variant="outline" onClick={() => setCompare(checkpoint.id)}>
                Compare versions
              </Button>
            </div>
            {drafts
              .filter((draft) => draft.fromCheckpointId === checkpoint.id)
              .map((draft) => (
                <p key={draft.id} className="text-sm text-muted-foreground">
                  Branch started here:{" "}
                  <Link
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                    to="/resumes/$resumeId"
                    params={{ resumeId: draft.id }}
                  >
                    {draft.data.name}
                  </Link>
                </p>
              ))}
          </article>
        ))}
        {!result.isPending && !result.error && checkpoints.length === 0 && (
          <p className="text-sm">
            No checkpoints yet. Save a checkpoint from the acknowledged draft in its editor.
          </p>
        )}
        {result.hasNextPage && (
          <Button
            variant="outline"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            Load earlier checkpoints
          </Button>
        )}
      </div>
      {restore && <RestoreCheckpoint checkpointId={restore} onClose={() => setRestore(null)} />}
      {compare && (
        <CheckpointComparison
          draftId={selected}
          checkpointId={compare}
          onClose={() => setCompare(null)}
        />
      )}
    </EvidenceDialog>
  );
}
