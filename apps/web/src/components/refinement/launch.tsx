import type { SourceRefinementList, StartSourceRefinementRequest } from "@river/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import type { getCheckpoint } from "~/server/checkpoint-functions";
import { generateSourceRefinementTask, getSourceRefinements } from "~/server/refinement-functions";

type Checkpoint = Extract<Awaited<ReturnType<typeof getCheckpoint>>, { ok: true }>["value"];
export function SourceRefinements({
  detail,
  onClose,
}: {
  detail: Checkpoint;
  onClose: () => void;
}) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    [goal, setGoal] = useState("");
  const [state, setState] = useState<SourceRefinementList["state"]>(),
    [offset, setOffset] = useState(0);
  const request = useRef<StartSourceRefinementRequest | null>(null);
  const query = useQuery({
    queryKey: ["source-refinements", "list", detail.checkpoint.id, state, offset],
    queryFn: async () =>
      unwrap(
        await getSourceRefinements({ data: { checkpointId: detail.checkpoint.id, state, offset } }),
      ),
    refetchInterval: 5000,
  });
  const start = useMutation({
    mutationFn: async () => {
      if (!detail.operation) throw new Error("The checkpoint has no successful document output.");
      request.current ??= {
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
      wide
      className="sm:max-w-[1200px]"
      title="Refine the final document"
      description="Request changes to this résumé’s wording or layout, or continue reviewing a saved proposal."
      onClose={onClose}
      dirty={!!goal}
      pending={start.isPending}
    >
      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <section className="min-w-0 space-y-5 rounded-md border p-5 md:p-6">
          <h2 className="text-[28px] leading-[34px]">Request document changes</h2>
          <Badge variant="outline">{ready ? "Ready to refine" : "Document unavailable"}</Badge>
          <p className="text-lg font-semibold">{detail.checkpoint.data.name}</p>
          <p className="eyebrow">
            Checkpoint {detail.checkpoint.id.slice(-8)} · Draft revision{" "}
            {detail.checkpoint.draftRevision}
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-primary">Exact captured identities</summary>
            <div className="mt-3 space-y-2 break-all font-mono text-xs">
              <p>Checkpoint {detail.checkpoint.id}</p>
              <p>Document operation {detail.operation?.id ?? "Unavailable"}</p>
              <p>Structured base {detail.source?.structuredBaseId ?? detail.checkpoint.id}</p>
              <p>Template {detail.checkpoint.templateIdentity}</p>
            </div>
          </details>
          {!ready && (
            <p className="border-l-2 border-highlight bg-highlight/10 p-4">
              Wait for this checkpoint’s PDF to finish preparing, or retry if preparation failed.
            </p>
          )}
          {query.data?.configured ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                start.mutate();
              }}
            >
              <FormField label="Refinement goal">
                <Textarea
                  required
                  maxLength={4000}
                  rows={4}
                  disabled={start.isPending || !!request.current}
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </FormField>
              <p className="text-xs text-muted-foreground">{goal.length} / 4,000 characters</p>
              <p className="text-sm text-muted-foreground">
                Review the proposed wording, LaTeX changes, and PDF before accepting.
              </p>
              <Failure error={start.error} />
              <Button type="submit" disabled={!ready || !goal.trim() || start.isPending}>
                {start.isPending
                  ? "Saving request…"
                  : start.error
                    ? "Retry request"
                    : "Suggest document changes"}
              </Button>
              {start.error && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    request.current = null;
                    start.reset();
                  }}
                >
                  Edit request
                </Button>
              )}
            </form>
          ) : (
            query.data && (
              <p className="border-l-2 border-highlight bg-highlight/10 p-4">
                AI generation is unavailable. Saved candidates, publication recovery, and base
                review/export remain available.
              </p>
            )
          )}
          <Button variant="outline" onClick={onClose}>
            Return to checkpoint / export
          </Button>
        </section>
        <section className="min-w-0 space-y-5 rounded-md border p-5 md:p-6">
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
                      <p className="font-mono text-xs text-muted-foreground">{item.id.slice(-8)}</p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm">{item.stage}</p>
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
      </div>
    </EvidenceDialog>
  );
}
