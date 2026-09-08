import { canonicalJson } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { applyWordingBatch, getPendingWording } from "~/server/wording-functions";

/** Paper BMQ-0/BMZ-0: pagination never narrows the selected/all command scope. */
export function WordingBulk({
  draftId,
  revision,
  busy,
  onApply,
  onReview,
}: {
  draftId: string;
  revision: number;
  busy: boolean;
  onApply: (perform: () => Promise<string>) => Promise<string>;
  onReview: (taskId: string) => void;
}) {
  const client = useQueryClient(),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<ReadonlySet<string>>(new Set()),
    [edits, setEdits] = useState<Record<string, string>>({});
  const receipt = useRef<{ payload: string; key: string } | null>(null);
  const choices = useQuery({
    queryKey: ["wording-ai", "pending", draftId],
    queryFn: async () => unwrap(await getPendingWording({ data: { draftId, offset: 0 } })),
  });
  const rows = choices.data ?? [];
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const selectedAlternatives =
    new Set(selectedRows.map((row) => canonicalJson(row.path))).size !== selectedRows.length;
  const allAlternatives = new Set(rows.map((row) => canonicalJson(row.path))).size !== rows.length;
  const pageOffset = Math.min(offset, Math.max(0, Math.floor((rows.length - 1) / 10) * 10));
  const action = useMutation({
    mutationFn: async (all: boolean) => {
      const items = (all ? rows : selectedRows).map((row) => ({
        id: row.id,
        revision: row.revision,
        digest: row.digest,
        wording: edits[row.id] ?? row.payload?.wording ?? "",
      }));
      const request = { draftId, revision, items },
        payload = canonicalJson(request);
      if (receipt.current?.payload !== payload)
        receipt.current = { payload, key: crypto.randomUUID() };
      const idempotencyKey = receipt.current.key;
      return onApply(
        async () => unwrap(await applyWordingBatch({ data: { ...request, idempotencyKey } })).id,
      );
    },
    onSuccess: async () => {
      setSelected(new Set());
      await client.invalidateQueries({ queryKey: ["wording-ai"] });
    },
    onError: async () => {
      await Promise.all([choices.refetch(), client.invalidateQueries({ queryKey: ["resumes"] })]);
    },
  });
  if (!rows.length && !choices.error && !action.error) return null;
  return (
    <section className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-editorial text-2xl">Ready to apply</h3>
        <span className="text-sm">
          {selectedRows.length} selected · {rows.length} choices
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose one alternative per field. Open a choice to review changed inputs, generate a fresh
        result, or dismiss an alternative.
      </p>
      {allAlternatives && (
        <p role="status" className="text-sm text-muted-foreground">
          Some choices target the same wording. Select one per field, or dismiss alternatives before
          applying all.
        </p>
      )}
      <Failure error={choices.error ?? action.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={action.isPending}
          onClick={() => setSelected(new Set(rows.map((row) => row.id)))}
        >
          Select all {rows.length}
        </Button>
        <Button variant="ghost" disabled={action.isPending} onClick={() => setSelected(new Set())}>
          Clear selection
        </Button>
        {action.error && (
          <Button variant="outline" onClick={() => void choices.refetch()}>
            Refresh choices
          </Button>
        )}
      </div>
      {rows.slice(pageOffset, pageOffset + 10).map((row) => (
        <article key={row.id} className="space-y-3 rounded-lg border p-4">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              disabled={action.isPending}
              onChange={(event) =>
                setSelected((value) => {
                  const next = new Set(value);
                  if (event.target.checked) next.add(row.id);
                  else next.delete(row.id);
                  return next;
                })
              }
            />
            <span>{row.field}</span>
          </label>
          <p className="text-sm text-muted-foreground">Wording at generation</p>
          <p className="whitespace-pre-wrap text-sm">{row.original}</p>
          <label htmlFor={`wording-${row.id}`} className="block space-y-2">
            <span className="text-sm">Suggested wording</span>
            <Textarea
              id={`wording-${row.id}`}
              value={edits[row.id] ?? row.payload?.wording ?? ""}
              disabled={action.isPending}
              maxLength={10000}
              onChange={(event) =>
                setEdits((value) => ({ ...value, [row.id]: event.target.value }))
              }
            />
          </label>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => onReview(row.taskId)}
          >
            Review choice
          </Button>
        </article>
      ))}
      {rows.length > 10 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={pageOffset === 0}
            onClick={() => setOffset(Math.max(0, pageOffset - 10))}
          >
            Previous
          </Button>
          <span>
            {pageOffset + 1}–{Math.min(pageOffset + 10, rows.length)} of {rows.length}
          </span>
          <Button
            variant="outline"
            disabled={pageOffset + 10 >= rows.length}
            onClick={() => setOffset(pageOffset + 10)}
          >
            Next
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          disabled={busy || action.isPending || !selectedRows.length || selectedAlternatives}
          onClick={() => action.mutate(false)}
        >
          Apply selected ({selectedRows.length})
        </Button>
        <Button
          disabled={busy || action.isPending || !rows.length || allAlternatives}
          onClick={() => action.mutate(true)}
        >
          Apply all {rows.length}
        </Button>
      </div>
    </section>
  );
}
