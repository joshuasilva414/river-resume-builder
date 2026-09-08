import type { BulkAddSourceEvidenceRequest, StartSourceAiRequest } from "@river/contracts";
import { type AiSelection, canonicalJson, EvidenceType } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation } from "~/server/functions";
import {
  addExtractedEvidence,
  generateSourceAiTask,
  getSourceAiTask,
  getSourceAiTasks,
} from "~/server/source-ai-functions";
import { ClaimEditor } from "./claim-editor";
import { EvidenceDialog, Failure, selectClass, unwrap } from "./shared";

type Detail = Extract<Awaited<ReturnType<typeof getSourceAiTask>>, { ok: true }>["value"];
type Source = {
  id: string;
  revision: number;
  currentProcessingId: string | null;
  title: string;
  state: string;
  archivedAt?: number | null;
  extractionAi?: AiSelection | null;
};
const active = (state?: string) => state === "Pending" || state === "Running";

export function SourceAiPanel({
  source,
  processingId,
  onExtraction,
}: {
  source: Source;
  processingId: string | null;
  onExtraction: (id?: string) => void;
}) {
  const client = useQueryClient(),
    pending = useRef<{ payload: string; key: string } | null>(null);
  const [view, setView] = useState<"launch" | "review" | "manual" | null>(null),
    [chosenTask, setChosenTask] = useState<string>();
  const [ai, setAi] = useState<AiSelection>(),
    [added, setAdded] = useState(0);
  const list = useQuery({
    queryKey: ["source-ai", "list", source.id, source.currentProcessingId],
    queryFn: async () =>
      unwrap(await getSourceAiTasks({ data: { sourceId: source.id, offset: 0 } })),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => active(item.state)) ||
      (source.extractionAi && !query.state.data?.items.length)
        ? 2500
        : false,
  });
  const taskId = chosenTask ?? list.data?.items[0]?.id;
  const detail = useQuery({
    queryKey: ["source-ai", "detail", taskId],
    enabled: Boolean(taskId),
    queryFn: async () => unwrap(await getSourceAiTask({ data: { id: taskId ?? "" } })),
    refetchInterval: (query) => (active(query.state.data?.operation?.state) ? 1500 : false),
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!processingId) throw Error("Wait for source processing to finish.");
      const input: Omit<StartSourceAiRequest, "idempotencyKey"> = {
        sourceId: source.id,
        revision: source.revision,
        processingId,
        focus: "",
        contexts: [],
        ai,
      };
      const payload = canonicalJson(input);
      if (pending.current?.payload !== payload)
        pending.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await generateSourceAiTask({ data: { ...input, idempotencyKey: pending.current.key } }),
      );
    },
    onSuccess: async (result) => {
      setChosenTask(result.id);
      setView(null);
      setAdded(0);
      pending.current = null;
      await client.invalidateQueries({ queryKey: ["source-ai"] });
    },
  });
  const cancel = useMutation({
    mutationFn: async () => {
      if (!detail.data?.operation) return;
      return unwrap(
        await cancelDocumentOperation({
          data: {
            operationId: detail.data.operation.id,
            idempotencyKey: `cancel:${detail.data.operation.id}`,
          },
        }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["source-ai"] }),
  });
  const count =
    detail.data?.candidates.filter((item) => item.state === "Pending" && item.payload).length ?? 0;
  const running = active(detail.data?.operation?.state);
  const ready =
    source.state === "Ready" && source.currentProcessingId === processingId && !source.archivedAt;
  return (
    <section className="space-y-4 border-y py-5" aria-label="Extract evidence">
      <div>
        <h3 className="font-sans text-base font-semibold">Evidence from this source</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Review the extracted text once, then add the items you want to keep.
        </p>
      </div>
      {running ? (
        <div
          className="flex items-center justify-between gap-4 rounded-lg border p-4"
          role="status"
        >
          <span className="flex items-center gap-3">
            <LoaderCircle className="size-4 animate-spin" /> Extracting evidence…
          </span>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {count > 0 && <Button onClick={() => setView("review")}>Review {count} items</Button>}
          <Button variant="outline" disabled={!ready} onClick={() => setView("launch")}>
            Extract evidence
          </Button>
          <Button variant="ghost" onClick={() => setView("manual")}>
            Add evidence manually
          </Button>
        </div>
      )}
      {!ready && processingId !== source.currentProcessingId && (
        <Button variant="link" onClick={() => onExtraction()}>
          Use current source text
        </Button>
      )}
      {detail.data?.operation?.state === "Failed" && (
        <p className="text-sm text-destructive">
          {detail.data.operation.failure ?? "Evidence extraction failed. Your source is preserved."}{" "}
          Choose a model and select Extract evidence to retry.
        </p>
      )}
      {detail.data?.operation?.state === "Cancelled" && (
        <p className="text-sm text-muted-foreground">
          Extraction cancelled. Your source is preserved.
        </p>
      )}
      {detail.data?.operation?.state === "Succeeded" && !count && !added && (
        <p className="text-sm text-muted-foreground">
          {detail.data.candidates.length
            ? "All extracted items have been handled."
            : "No supported evidence was found. You can add evidence manually."}
        </p>
      )}
      {added > 0 && (
        <p role="status" className="text-sm text-approved">
          Added {added} evidence items.{" "}
          <Link to="/evidence" className="underline">
            View evidence
          </Link>
        </p>
      )}
      <Failure error={list.error ?? detail.error ?? cancel.error} />
      {(list.data?.items.length ?? 0) > 1 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Previous extractions
          </summary>
          <div className="mt-3 space-y-2">
            {list.data?.items.map((item) => (
              <Button key={item.id} variant="link" onClick={() => setChosenTask(item.id)}>
                {new Date(item.createdAt).toLocaleString()} · {item.pending} items to review
              </Button>
            ))}
          </div>
        </details>
      )}
      {view === "launch" && (
        <EvidenceDialog
          title="Extract evidence"
          description="Use your selected personal AI connection to find experience, achievements, education, credentials, and skills throughout this source."
          onClose={() => setView(null)}
          pending={generate.isPending}
        >
          <div className="space-y-5">
            <AiSelector value={ai} onChange={setAi} disabled={generate.isPending} />
            <Failure error={generate.error} />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setView(null)}>
                Cancel
              </Button>
              <Button disabled={generate.isPending || !ready} onClick={() => generate.mutate()}>
                {generate.isPending ? "Starting…" : "Extract evidence"}
              </Button>
            </div>
          </div>
        </EvidenceDialog>
      )}
      {view === "review" && detail.data && (
        <ExtractionReview
          key={detail.data.task.id}
          detail={detail.data}
          sourceTitle={source.title}
          onClose={() => setView(null)}
          onAdded={(count) => {
            setAdded(count);
          }}
        />
      )}
      {view === "manual" && (
        <ClaimEditor
          onClose={() => setView(null)}
          onSaved={() => setAdded(1)}
          initialMaterial={{ assertion: "", citations: [], contexts: [], sourceIds: [source.id] }}
        />
      )}
    </section>
  );
}

type Editable = BulkAddSourceEvidenceRequest["items"][number] & { keywords: string };
function editableItems(detail: Detail): Editable[] {
  return detail.candidates.flatMap((item) =>
    item.state === "Pending" && item.payload
      ? [
          {
            id: item.id,
            revision: item.revision,
            digest: item.digest,
            assertion: item.payload.material.assertion,
            metadata: item.payload.metadata,
            keywords: item.payload.metadata.tags.join(", "),
          },
        ]
      : [],
  );
}
function ExtractionReview({
  detail,
  sourceTitle,
  onClose,
  onAdded,
}: {
  detail: Detail;
  sourceTitle: string;
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const client = useQueryClient(),
    pending = useRef<{ payload: string; key: string } | null>(null);
  const [items, setItems] = useState(() => editableItems(detail)),
    [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(0),
    [savedCount, setSavedCount] = useState(0),
    [stale, setStale] = useState(detail.staleReasons);
  const save = useMutation({
    mutationFn: async (mode: "selected" | "all") => {
      const chosen = mode === "all" ? items : items.filter((item) => selected.has(item.id));
      const input = {
        taskId: detail.task.id,
        mode,
        items: chosen.map(({ keywords, ...item }) => ({
          ...item,
          metadata: {
            ...item.metadata,
            type: item.metadata.type ?? "Other",
            tags: [
              ...new Set(
                keywords
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            ],
          },
        })),
      };
      const payload = canonicalJson(input);
      if (pending.current?.payload !== payload)
        pending.current = { payload, key: crypto.randomUUID() };
      unwrap(
        await addExtractedEvidence({ data: { ...input, idempotencyKey: pending.current.key } }),
      );
      return chosen.map((item) => item.id);
    },
    onSuccess: async (ids) => {
      setItems((rows) => rows.filter((item) => !ids.includes(item.id)));
      setSelected(new Set());
      setPage(0);
      setSavedCount((count) => count + ids.length);
      onAdded(savedCount + ids.length);
      pending.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["evidence"] }),
        client.invalidateQueries({ queryKey: ["source-ai"] }),
      ]);
    },
  });
  const refresh = useMutation({
    mutationFn: async () => unwrap(await getSourceAiTask({ data: { id: detail.task.id } })),
    onSuccess: (current) => {
      setItems(editableItems(current));
      setSelected(new Set());
      setStale(current.staleReasons);
      setPage(0);
      pending.current = null;
      save.reset();
    },
  });
  const update = (id: string, change: Partial<Editable>) =>
    setItems((rows) => rows.map((item) => (item.id === id ? { ...item, ...change } : item)));
  const shown = items.slice(page * 10, page * 10 + 10);
  return (
    <EvidenceDialog
      title="Review extracted evidence"
      description={`From ${sourceTitle}. Edit text, types, and keywords before adding your evidence.`}
      wide
      onClose={onClose}
      pending={save.isPending}
    >
      <div className="space-y-5">
        {savedCount > 0 && (
          <p role="status" className="text-sm text-approved">
            Added {savedCount} evidence items. They are ready to use.
          </p>
        )}
        {stale.length > 0 && (
          <p className="text-sm text-destructive">
            This source changed. Refresh the results or extract evidence again.
          </p>
        )}
        <Failure error={save.error ?? refresh.error} />
        {(save.error || stale.length > 0) && (
          <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            Refresh results
          </Button>
        )}
        {items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  disabled={save.isPending}
                  checked={selected.size === items.length}
                  onChange={(event) =>
                    setSelected(new Set(event.target.checked ? items.map((item) => item.id) : []))
                  }
                />
                Select all {items.length} items
              </label>
              <span className="text-sm text-muted-foreground">
                {selected.size} selected · {items.length} total
              </span>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={save.isPending || !selected.size || stale.length > 0}
                  onClick={() => save.mutate("selected")}
                >
                  Add selected ({selected.size})
                </Button>
                <Button
                  disabled={save.isPending || stale.length > 0}
                  onClick={() => save.mutate("all")}
                >
                  Add all ({items.length})
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Add all includes every item across all pages.
            </p>
            <div className="space-y-4">
              {shown.map((item, index) => (
                <article
                  key={item.id}
                  className="grid grid-cols-[28px_minmax(0,1fr)] gap-4 rounded-lg border p-5"
                >
                  <input
                    className="mt-3 size-4"
                    type="checkbox"
                    disabled={save.isPending}
                    aria-label={`Select evidence item ${page * 10 + index + 1}`}
                    checked={selected.has(item.id)}
                    onChange={(event) =>
                      setSelected((ids) => {
                        const next = new Set(ids);
                        if (event.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                  />
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <select
                        className={`${selectClass} max-w-48`}
                        disabled={save.isPending}
                        aria-label={`Type for item ${page * 10 + index + 1}`}
                        value={item.metadata.type ?? "Other"}
                        onChange={(event) => {
                          const type = EvidenceType.literals.find(
                            (value) => value === event.target.value,
                          );
                          if (type) update(item.id, { metadata: { ...item.metadata, type } });
                        }}
                      >
                        {EvidenceType.literals.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">Source: {sourceTitle}</span>
                    </div>
                    <Textarea
                      disabled={save.isPending}
                      aria-label={`Evidence text for item ${page * 10 + index + 1}`}
                      value={item.assertion}
                      maxLength={4000}
                      onChange={(event) => update(item.id, { assertion: event.target.value })}
                    />
                    <Input
                      disabled={save.isPending}
                      aria-label={`Keywords for item ${page * 10 + index + 1}`}
                      placeholder="Keywords, separated by commas"
                      value={item.keywords}
                      onChange={(event) => update(item.id, { keywords: event.target.value })}
                    />
                  </div>
                </article>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <p className="text-sm text-muted-foreground">
                {page * 10 + 1}–{Math.min((page + 1) * 10, items.length)} of {items.length}
              </p>
              <Button
                variant="outline"
                disabled={(page + 1) * 10 >= items.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Done
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
