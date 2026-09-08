import {
  type ContentRecord,
  canonicalJson,
  contentRecordText,
  type EvidenceReference,
  type EvidenceType,
  resolveContentSchema,
  type SchemaBundle,
} from "@river/domain";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Schema } from "effect";
import { useDeferredValue, useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getEvidence } from "~/server/evidence-functions";

function useEvidenceOptions(type?: EvidenceType) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const result = useInfiniteQuery({
    queryKey: ["schema-evidence", type, query],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await getEvidence({
          data: { type, query, status: "All", archived: false, contextId: null, offset: pageParam },
        }),
      ),
    getNextPageParam: (page, pages) => (page.hasMore ? pages.length * 50 : undefined),
  });
  return {
    search,
    setSearch,
    result,
    items: result.data?.pages.flatMap((page) => page.items) ?? [],
  };
}
type EvidenceOption = ReturnType<typeof useEvidenceOptions>["items"][number];
export function SkillOptions({
  values,
  onChange,
  disabled,
}: {
  values: readonly string[];
  onChange: (values: readonly string[], evidence: readonly EvidenceReference[]) => void;
  disabled: boolean;
}) {
  const options = useEvidenceOptions("Skill");
  return (
    <div className="space-y-3">
      <FormField label="Find skills in your evidence">
        <Input
          value={options.search}
          onChange={(event) => options.setSearch(event.target.value)}
          disabled={disabled}
        />
      </FormField>
      <Failure error={options.result.error} />
      {options.items.map((item) => (
        <label className="flex min-h-11 items-center gap-3 border-b py-2" key={item.id}>
          <input
            type="checkbox"
            checked={values.includes(item.assertion)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...new Set([...values, item.assertion])]
                  : values.filter((value) => value !== item.assertion),
                [{ claimId: item.id, revisionId: item.currentRevisionId }],
              )
            }
          />
          <span>{item.assertion}</span>
        </label>
      ))}
      {!options.items.length && !options.result.isPending && (
        <p className="text-sm text-muted-foreground">Add Skill evidence to see it here.</p>
      )}
      {values
        .filter((value) => !options.items.some((item) => item.assertion === value))
        .map((value) => (
          <label className="flex min-h-11 items-center gap-3" key={value}>
            <input
              type="checkbox"
              checked
              disabled={disabled}
              onChange={() =>
                onChange(
                  values.filter((item) => item !== value),
                  [],
                )
              }
            />
            <span>{value}</span>
          </label>
        ))}
      {options.result.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={options.result.isFetchingNextPage}
          onClick={() => void options.result.fetchNextPage()}
        >
          More skills
        </Button>
      )}
    </div>
  );
}
export function EvidenceFill({
  bundle,
  record,
  onApply,
  disabled,
}: {
  bundle: SchemaBundle;
  record: ContentRecord;
  onApply: (record: ContentRecord, evidence: readonly EvidenceReference[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(new Map<string, EvidenceOption>());
  const [review, setReview] = useState<{
    inputIdentity: string;
    items: readonly EvidenceOption[];
    record: ContentRecord;
    evidence: readonly EvidenceReference[];
  } | null>(null);
  const options = useEvidenceOptions();
  const definition = resolveContentSchema(bundle, record.schema);
  const inputIdentity = canonicalJson({ record, bundle });
  const reviewStale = review !== null && review.inputIdentity !== inputIdentity;
  if (!open)
    return (
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Fill from evidence
      </Button>
    );
  return (
    <section className="space-y-4 rounded-md border bg-muted/30 p-4">
      <h3 className="font-editorial text-2xl">Fill from evidence</h3>
      <p className="text-sm text-muted-foreground">
        Select relevant evidence. Review supported values before adding them. Unknown fields stay
        empty.
      </p>
      {review ? (
        <>
          {reviewStale ? (
            <p role="alert" className="text-sm">
              Your entry changed after this review. Go back and review again to keep those edits.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="whitespace-pre-line text-sm">
                {contentRecordText(bundle, review.record).join("\n")}
              </p>
            </div>
          )}
          <details className="space-y-2">
            <summary className="cursor-pointer text-sm font-medium">
              Selected evidence ({review.items.length})
            </summary>
            <ul className="space-y-2 text-sm">
              {review.items.map((item) => (
                <li key={item.id}>{item.assertion}</li>
              ))}
            </ul>
          </details>
          <p className="text-sm text-muted-foreground">
            Dates, numbers, and unnamed details remain unchanged.
          </p>
          <Button
            type="button"
            disabled={disabled || reviewStale}
            onClick={() => {
              if (disabled || reviewStale) return;
              onApply(review.record, review.evidence);
              setOpen(false);
              setReview(null);
            }}
          >
            Use these values
          </Button>
          <Button type="button" variant="ghost" onClick={() => setReview(null)}>
            {reviewStale ? "Back to refresh review" : "Back"}
          </Button>
        </>
      ) : (
        <>
          <FormField label="Find relevant evidence">
            <Input
              value={options.search}
              onChange={(event) => options.setSearch(event.target.value)}
              disabled={disabled}
            />
          </FormField>
          <Failure error={options.result.error} />
          <p role="status" className="text-sm text-muted-foreground">
            {selected.size} evidence {selected.size === 1 ? "item" : "items"} selected
          </p>
          {options.items.map((item) => (
            <label className="flex min-h-11 items-start gap-3 border-b py-3" key={item.id}>
              <input
                className="mt-1"
                type="checkbox"
                checked={selected.has(item.id)}
                disabled={disabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) => {
                    const next = new Map(previous);
                    if (checked) next.set(item.id, item);
                    else next.delete(item.id);
                    return next;
                  });
                }}
              />
              <span className="text-sm">{item.assertion}</span>
            </label>
          ))}
          {options.result.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || options.result.isFetchingNextPage}
              onClick={() => void options.result.fetchNextPage()}
            >
              More evidence
            </Button>
          )}
          <Button
            type="button"
            disabled={!selected.size || disabled}
            onClick={() => {
              const items = [...selected.values()];
              const values: Record<string, Schema.Json> = { ...record.values };
              for (const field of definition.fields) {
                if (field.kind === "list" && field.id === "accomplishments")
                  values[field.id] = items
                    .filter((item) => item.metadata.type !== "Skill")
                    .map((item) => item.assertion);
                else if (field.kind === "list" && field.items === "skill")
                  values[field.id] = items
                    .filter((item) => item.metadata.type === "Skill")
                    .map((item) => item.assertion);
                else if (field.kind === "text" && !values[field.id]) {
                  const prefix = `${field.label.toLowerCase()}:`;
                  const explicit = items
                    .map((item) => item.assertion)
                    .find((text) => text.toLowerCase().startsWith(prefix));
                  if (explicit) values[field.id] = explicit.slice(prefix.length).trim();
                }
              }
              setReview({
                inputIdentity,
                items,
                record: { ...record, values },
                evidence: items.map((item) => ({
                  claimId: item.id,
                  revisionId: item.currentRevisionId,
                })),
              });
            }}
          >
            Review filled values
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setReview(null);
        }}
      >
        Cancel
      </Button>
    </section>
  );
}
