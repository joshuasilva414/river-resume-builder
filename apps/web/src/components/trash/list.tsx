import { TrashKind } from "@river/contracts";
import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Failure, FormField, selectClass, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getTrash } from "~/server/trash-functions";
import { TrashAction, trashLabels } from "./actions";

export function TrashList() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TrashKind | null>(null);
  const [offset, setOffset] = useState(0);
  const deferred = useDeferredValue(query);
  const results = useQuery({
    queryKey: ["trash", deferred, kind, offset],
    queryFn: async () => unwrap(await getTrash({ data: { query: deferred, kind, offset } })),
  });
  return (
    <div className="space-y-7 px-5 py-7 md:px-8">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-60 flex-1">
          <FormField label="Search Trash">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder="Search deleted items…"
            />
          </FormField>
        </div>
        <FormField label="Type">
          <select
            className={selectClass}
            value={kind ?? "all"}
            onChange={(event) => {
              setKind(
                event.target.value === "all"
                  ? null
                  : Schema.decodeUnknownSync(TrashKind)(event.target.value),
              );
              setOffset(0);
            }}
          >
            <option value="all">All types</option>
            {Object.entries(trashLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <Failure error={results.error} />
      {results.isPending && (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" />
          Loading Trash…
        </p>
      )}
      {results.data && (
        <>
          <p className="text-sm text-muted-foreground">
            {results.data.total} deleted {results.data.total === 1 ? "item" : "items"}
          </p>
          {results.data.items.length ? (
            <div className="divide-y border-y">
              {results.data.items.map((item) => (
                <article
                  key={`${item.kind}:${item.id}`}
                  className="flex flex-wrap items-center gap-5 py-6"
                >
                  <p className="w-24 shrink-0 text-sm text-muted-foreground">
                    {trashLabels[item.kind]}
                  </p>
                  <div className="min-w-48 flex-1">
                    <h2 className="text-lg font-semibold break-words">{item.label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deleted {new Date(item.deletedAt).toLocaleString()}
                    </p>
                  </div>
                  <TrashAction item={{ ...item, archivedAt: item.deletedAt }} />
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-3 py-10 text-center">
              <Trash2 className="mx-auto size-7 text-muted-foreground" />
              <h2 className="font-editorial text-3xl">
                {query || kind ? "No matching deleted items." : "Trash is empty."}
              </h2>
              <p className="text-sm text-muted-foreground">
                Deleted items appear here when you need to restore them.
              </p>
            </div>
          )}
          {(offset > 0 || results.data.hasMore) && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!results.data.hasMore}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <p className="border-l-2 border-primary py-3 pl-5 text-sm text-muted-foreground">
        Saved résumés keep their content and referenced source material. Restoring an item makes it
        available for new work again.
      </p>
    </div>
  );
}
