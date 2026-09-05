import type { TemplateAiList } from "@river/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Failure, FormField, selectClass, unwrap } from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getTemplateAiTasks } from "~/server/template-ai-functions";
import { getTemplates } from "~/server/template-functions";
import { scopeLabel } from "./shared";

export function TemplateAiQueue({
  initialDesignId,
  onSelect,
  onDraft,
  onConversation,
}: {
  initialDesignId?: string;
  onSelect: (id: string) => void;
  onDraft: (id: string) => void;
  onConversation: (id: string) => void;
}) {
  const [designId, setDesignId] = useState<string | null>(initialDesignId ?? null),
    [state, setState] = useState<TemplateAiList["state"]>(null),
    [offset, setOffset] = useState(0);
  const designs = useInfiniteQuery({
    queryKey: ["templates", "queue-designs"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getTemplates({ data: { state: null, offset: pageParam } })),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 50 : undefined),
  });
  const choices = Array.from(
    new Map(
      designs.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  );
  const query = useQuery({
    queryKey: ["templates", "ai", "queue", designId, state, offset],
    queryFn: async () => unwrap(await getTemplateAiTasks({ data: { designId, state, offset } })),
    refetchInterval: (data) =>
      data.state.data?.items.some((item) => ["Pending", "Running"].includes(item.operationState))
        ? 2000
        : false,
  });
  const counts = query.data?.counts ?? [];
  return (
    <section className="space-y-5 px-5 py-6 md:px-8">
      <h2 className="font-editorial text-[28px]">Saved template proposals</h2>
      <div className="max-w-xl space-y-2">
        <FormField label="Design">
          <select
            className={selectClass}
            value={designId ?? "all"}
            onChange={(event) => {
              setDesignId(event.target.value === "all" ? null : event.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All designs</option>
            {designId && !choices.some((item) => item.id === designId) && (
              <option value={designId}>Selected design</option>
            )}
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        {designs.hasNextPage && (
          <Button
            variant="link"
            size="sm"
            onClick={() => void designs.fetchNextPage()}
            disabled={designs.isFetchingNextPage}
          >
            Load more designs
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {([null, "Pending", "Accepted", "Rejected"] as const).map((value) => (
          <Button
            key={value ?? "all"}
            variant={state === value ? "secondary" : "outline"}
            aria-pressed={state === value}
            onClick={() => {
              setState(value);
              setOffset(0);
            }}
          >
            {value ?? "All"} ·{" "}
            {value
              ? (counts.find((item) => item.state === value)?.count ?? 0)
              : counts.reduce((sum, item) => sum + item.count, 0)}
          </Button>
        ))}
      </div>
      <p className="text-base md:text-sm text-muted-foreground">
        The design filter includes proposals based on its earlier immutable revisions.
      </p>
      <Failure error={query.error} />
      <Failure error={designs.error} />
      {query.isPending && <p role="status">Loading saved proposals…</p>}
      {query.data && !query.data.items.length && (
        <p className="py-10 text-muted-foreground">
          No {state?.toLowerCase() ?? "saved"} template proposals yet.
        </p>
      )}
      <div className="divide-y">
        {query.data?.items.map((item) => (
          <article key={item.id} className="flex min-w-0 flex-wrap justify-between gap-4 py-5">
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="break-words font-semibold">
                {item.name} · {scopeLabel(item.scope)}
              </h3>
              <p className="text-base md:text-sm text-muted-foreground">
                {item.state === "Rejected"
                  ? "Generated content was discarded."
                  : item.state === "Accepted"
                    ? "Created an immutable Draft."
                    : item.expiresAt && item.expiresAt <= Date.now()
                      ? "Preview expired · Candidate remains saved"
                      : item.stage}
              </p>
              <p className="eyebrow break-all">
                {new Date(item.createdAt).toLocaleString()} ·{" "}
                {item.base.kind === "fixed" ? `${item.base.theme} / 1` : item.base.revisionId}
              </p>
            </div>
            <div className="flex w-44 shrink-0 flex-col items-start gap-3">
              <Badge variant="outline">{item.state ?? "Pending"}</Badge>
              <Button variant="outline" onClick={() => onSelect(item.id)}>
                {item.state === "Rejected" ? "Inspect decision" : "Inspect proposal"}
              </Button>
              {item.conversationId && (
                <Button
                  variant="link"
                  onClick={() => {
                    if (item.conversationId) onConversation(item.conversationId);
                  }}
                >
                  Continue conversation
                </Button>
              )}
              {item.resultRevisionId && (
                <Button
                  variant="link"
                  onClick={() => {
                    if (item.resultRevisionId) onDraft(item.resultRevisionId);
                  }}
                >
                  Open Draft
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(offset > 0 || query.data?.hasMore) && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </Button>
          <span className="eyebrow">Page {Math.floor(offset / 50) + 1}</span>
          <Button
            variant="outline"
            disabled={!query.data?.hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
