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
      title="Saved versions"
      description="Newest first. Open a saved version, compare changes, or create an editable copy."
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
            Reload résumés
          </Button>
        )}
        <FormField label="Résumé for this job">
          <select
            className="min-h-11 w-full rounded-sm border bg-background px-3"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {!drafts.some((draft) => draft.id === selected) && (
              <option value={selected}>{root.data?.draft.data.name ?? "Current résumé"}</option>
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
            Load more résumés
          </Button>
        )}
        <section className="space-y-2 rounded-md border bg-primary/5 p-4">
          <h3 className="font-semibold">Current résumé</h3>
          <p className="text-sm text-muted-foreground">
            Open the editor to continue working or save a version of this résumé.
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
          {current?.fromCheckpointId && <p className="text-xs">Created from a saved version.</p>}
        </section>
        <Failure error={result.error} />
        {result.isPending && <p role="status">Loading saved versions…</p>}
        {result.error && (
          <Button variant="outline" onClick={() => void result.refetch()}>
            Retry history
          </Button>
        )}
        {checkpoints.map((checkpoint) => (
          <article key={checkpoint.id} className="space-y-3 border-b py-4">
            <h3 className="font-editorial text-xl">{checkpoint.label ?? "Saved version"}</h3>
            <p className="eyebrow">{new Date(checkpoint.createdAt).toLocaleString()}</p>
            <p className="text-sm">
              Saved ·{" "}
              {checkpoint.state === "Succeeded"
                ? "PDF ready"
                : ["Pending", "Running"].includes(checkpoint.state)
                  ? "PDF preparing"
                  : `Document ${checkpoint.state.toLowerCase()}`}
              {checkpoint.exportedAt ? " · Exported" : ""}
              {checkpoint.scored ? " · Scored" : ""}
              {checkpoint.sourceRefined ? " · Document refined" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-primary underline"
                to="/checkpoints/$checkpointId"
                params={{ checkpointId: checkpoint.id }}
              >
                Open saved version
              </Link>
              <Button variant="outline" onClick={() => setRestore(checkpoint.id)}>
                Create an editable copy
              </Button>
              <Button variant="outline" onClick={() => setCompare(checkpoint.id)}>
                Compare versions
              </Button>
            </div>
            {drafts
              .filter((draft) => draft.fromCheckpointId === checkpoint.id)
              .map((draft) => (
                <p key={draft.id} className="text-sm text-muted-foreground">
                  Editable copy:{" "}
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
          <p className="text-sm">No saved versions yet. Open the résumé editor to save one.</p>
        )}
        {result.hasNextPage && (
          <Button
            variant="outline"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            Load earlier versions
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
