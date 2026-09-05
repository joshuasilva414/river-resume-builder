import type { HistorySelection } from "@river/contracts";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getCheckpoints } from "~/server/checkpoint-functions";
import { getResumes } from "~/server/composition-functions";
import { getHistoryDraftHead, getHistorySnapshot } from "~/server/history-functions";

export type HistorySnapshot = Extract<
  Awaited<ReturnType<typeof getHistorySnapshot>>,
  { ok: true }
>["value"];
export function snapshotLabel(value: HistorySnapshot) {
  return value.selection.kind === "checkpoint"
    ? `${value.label || "Checkpoint"} · ${value.selection.id.slice(-8)} · captured r${value.revision}`
    : `${value.content.data.name} · saved draft r${value.revision}`;
}
export function HistorySelectionPanel({
  label,
  draftId: initialDraftId,
  initialCheckpointId,
  pinned,
  onPin,
}: {
  label: string;
  draftId: string;
  initialCheckpointId?: string;
  pinned: HistorySnapshot | null;
  onPin: (value: HistorySnapshot) => void;
}) {
  const [draftId, setDraftId] = useState(initialDraftId),
    [target, setTarget] = useState(initialCheckpointId ?? "draft");
  const drafts = useInfiniteQuery({
    queryKey: ["resumes", "comparison-options"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getResumes({ data: { jobId: null, offset: pageParam } })),
    getNextPageParam: (page, _pages, offset) => (page.hasMore ? offset + 50 : undefined),
  });
  const checkpoints = useInfiniteQuery({
    queryKey: ["checkpoints", "comparison-options", draftId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getCheckpoints({ data: { draftId, offset: pageParam } })),
    getNextPageParam: (page, _pages, offset) => (page.hasMore ? offset + 50 : undefined),
  });
  const head = useQuery({
    queryKey: ["history-head", draftId],
    queryFn: async () => unwrap(await getHistoryDraftHead({ data: { id: draftId } })),
    refetchInterval: 5000,
  });
  const pinnedHead = useQuery({
    queryKey: ["history-head", pinned?.draftId],
    enabled: pinned?.selection.kind === "draft",
    queryFn: async () => unwrap(await getHistoryDraftHead({ data: { id: pinned?.draftId ?? "" } })),
    refetchInterval: 5000,
  });
  const load = useMutation({
    mutationFn: async (selection: HistorySelection) =>
      unwrap(await getHistorySnapshot({ data: selection })),
    onSuccess: onPin,
  });
  const options = drafts.data?.pages.flatMap((page) => page.items) ?? [],
    saved = checkpoints.data?.pages.flatMap((page) => page.items) ?? [];
  const newer =
    pinned?.selection.kind === "draft" &&
    pinnedHead.data &&
    (pinnedHead.data.revision !== pinned.revision || pinnedHead.data.previewId !== pinned.pdf?.id);
  return (
    <section className="min-w-0 space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">{label}</h3>
      <FormField label={`${label} draft or branch`}>
        <select
          className="min-h-11 min-w-0 w-full rounded-sm border bg-background px-3"
          value={draftId}
          disabled={load.isPending}
          onChange={(event) => {
            setDraftId(event.target.value);
            setTarget("draft");
          }}
        >
          {!options.some((item) => item.id === draftId) && (
            <option value={draftId}>Selected draft {draftId.slice(-8)}</option>
          )}
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.data.name} · {item.postingDetails.company}
              {item.branchName ? ` · from ${item.branchName}` : ""}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={`${label} version`}>
        <select
          className="min-h-11 min-w-0 w-full rounded-sm border bg-background px-3"
          value={target}
          disabled={load.isPending}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="draft">
            Saved working draft{head.data ? ` · r${head.data.revision}` : ""}
          </option>
          {target !== "draft" && !saved.some((item) => item.id === target) && (
            <option value={target}>Checkpoint {target.slice(-8)}</option>
          )}
          {saved.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label || "Checkpoint"} · {item.id.slice(-8)} · r{item.draftRevision} ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex flex-wrap gap-2">
        {drafts.hasNextPage && (
          <Button
            variant="outline"
            disabled={drafts.isFetchingNextPage}
            onClick={() => void drafts.fetchNextPage()}
          >
            More branches
          </Button>
        )}
        {checkpoints.hasNextPage && (
          <Button
            variant="outline"
            disabled={checkpoints.isFetchingNextPage}
            onClick={() => void checkpoints.fetchNextPage()}
          >
            Earlier checkpoints
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            void drafts.refetch();
            void checkpoints.refetch();
            void head.refetch();
          }}
        >
          Refresh choices
        </Button>
      </div>
      <Failure
        error={drafts.error ?? checkpoints.error ?? head.error ?? pinnedHead.error ?? load.error}
      />
      {newer && (
        <p role="status" className="border-l-2 border-warning bg-warning/10 p-3 text-sm">
          Newer saved work or a newer PDF is available. This comparison still shows its pinned
          revision and artifact. Load the selected version to refresh explicitly.
        </p>
      )}
      <Button
        disabled={load.isPending || (target === "draft" && !head.data)}
        onClick={() => {
          if (target === "draft") {
            if (head.data)
              load.mutate({ kind: "draft", id: draftId, revision: head.data.revision });
          } else load.mutate({ kind: "checkpoint", id: target });
        }}
      >
        {load.isPending ? "Loading complete input…" : `Load ${label.toLowerCase()} version`}
      </Button>
      {pinned && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-semibold">Pinned: {snapshotLabel(pinned)}</p>
          <p className="font-mono text-xs break-all">{pinned.digest}</p>
        </div>
      )}
    </section>
  );
}
