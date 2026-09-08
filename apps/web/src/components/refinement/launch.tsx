import type { SourceRefinementList, StartSourceRefinementRequest } from "@river/contracts";
import type { AiSelection } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import type { getCheckpoint } from "~/server/checkpoint-functions";
import { generateSourceRefinementTask, getSourceRefinements } from "~/server/refinement-functions";

type Checkpoint = Extract<Awaited<ReturnType<typeof getCheckpoint>>, { ok: true }>["value"];
function useRefinements(checkpointId: string, state?: SourceRefinementList["state"], offset = 0) {
  return useQuery({
    queryKey: ["source-refinements", "list", checkpointId, state, offset],
    queryFn: async () =>
      unwrap(await getSourceRefinements({ data: { checkpointId, state, offset } })),
    refetchInterval: 5000,
  });
}
export function SourceRefinements({
  detail,
  onClose,
}: {
  detail: Checkpoint;
  onClose: () => void;
}) {
  const [ai, setAi] = useState<AiSelection>(),
    [goal, setGoal] = useState("");
  const navigate = useNavigate(),
    client = useQueryClient();
  const request = useRef<StartSourceRefinementRequest | null>(null);
  const query = useRefinements(detail.checkpoint.id);
  const start = useMutation({
    mutationFn: async () => {
      if (!detail.operation) throw new Error("The checkpoint has no successful document output.");
      request.current ??= {
        ai,
        idempotencyKey: crypto.randomUUID(),
        checkpointId: detail.checkpoint.id,
        operationId: detail.operation.id,
        goal,
      };
      return unwrap(await generateSourceRefinementTask({ data: request.current }));
    },
    onSuccess: async (result) => {
      request.current = null;
      await client.invalidateQueries({ queryKey: ["source-refinements"] });
      await navigate({ to: "/source-refinements/$taskId", params: { taskId: result.id } });
      onClose();
    },
  });
  const ready =
    detail.operation?.state === "Succeeded" && detail.operation.artifacts?.validationPassed;
  return (
    <EvidenceDialog
      title="Refine this résumé"
      description="Review suggested changes before accepting them."
      onClose={onClose}
      dirty={!!goal}
      pending={start.isPending}
      className="sm:max-w-[600px]"
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          start.mutate();
        }}
      >
        {!ready && (
          <p className="text-sm">Prepare the PDF for this saved version before refining.</p>
        )}
        <FormField label="What would you like to change?">
          <Textarea
            required
            maxLength={4000}
            rows={4}
            disabled={start.isPending || !!request.current}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </FormField>
        <AiSelector
          value={ai}
          disabled={start.isPending || !!request.current}
          onChange={(selection) => {
            setAi(selection);
            request.current = null;
          }}
        />
        <Failure error={query.error} />
        <Failure error={start.error} />
        {query.data && !query.data.configured && (
          <p className="text-sm">Connect an AI provider in Settings to request changes.</p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={start.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!ready || !query.data?.configured || !goal.trim() || start.isPending}
          >
            {start.isPending ? "Starting…" : start.error ? "Retry" : "Suggest changes"}
          </Button>
        </div>
        {start.error && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              request.current = null;
              start.reset();
            }}
          >
            Edit request
          </Button>
        )}
      </form>
    </EvidenceDialog>
  );
}
export function SavedRefinements({ checkpointId }: { checkpointId: string }) {
  const [state, setState] = useState<SourceRefinementList["state"]>(),
    [offset, setOffset] = useState(0);
  const query = useRefinements(checkpointId, state, offset);
  return (
    <section className="space-y-5">
      <h2 className="text-[28px] leading-[34px]">Saved refinements</h2>
      <div className="flex flex-wrap gap-2">
        {([undefined, "Pending", "Accepted", "Rejected"] as const).map((value) => (
          <Button
            key={value ?? "All"}
            variant={state === value ? "default" : "outline"}
            aria-pressed={state === value}
            onClick={() => {
              setState(value);
              setOffset(0);
            }}
          >
            {value ?? "All"}
          </Button>
        ))}
      </div>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading saved refinements…</p>}
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry saved refinements
        </Button>
      )}
      {query.data && (
        <>
          <div className="divide-y">
            {query.data.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-4 py-[18px]">
                <div className="w-[104px] shrink-0 space-y-1">
                  <p className="text-sm font-semibold">{item.state ?? "Pending"}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  className="w-[88px] shrink-0 py-3 text-right text-sm font-semibold text-primary underline"
                  to="/source-refinements/$taskId"
                  params={{ taskId: item.id }}
                >
                  {item.state === "Pending" ? "Review" : "Inspect"}
                </Link>
              </div>
            ))}
          </div>
          {!query.data.items.length && (
            <p className="py-5 text-muted-foreground">No saved refinements in this view.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <p className="text-sm">
              {query.data.items.length
                ? `Showing ${offset + 1}–${offset + query.data.items.length}`
                : "0 results"}
            </p>
            <Button
              variant="outline"
              disabled={!query.data.hasMore}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
