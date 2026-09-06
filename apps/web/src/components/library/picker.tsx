import type { ContentType, LibraryKind, LibraryReference } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getLibrary } from "~/server/library-functions";
import { EvidenceLinks } from "./evidence-links";
import { kindLabels, LibraryDataView, type LibraryDetail, useLibraryDetail } from "./shared";
export function LibraryPicker({
  kind,
  type,
  onClose,
  onPick,
}: {
  kind: LibraryKind;
  type: ContentType | null;
  onClose: () => void;
  onPick: (ref: LibraryReference, detail: LibraryDetail) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const input = { kind, type, query, offset };
  const result = useQuery({
    queryKey: ["library", "search", input],
    queryFn: async () => unwrap(await getLibrary({ data: input })),
  });
  const [selected, setSelected] = useState<LibraryReference | null>(null);
  const detail = useLibraryDetail(
    selected ? { id: selected.itemId, revisionId: selected.revisionId } : null,
  );
  return (
    <EvidenceDialog
      title={`Choose ${kindLabels[kind].toLowerCase()}`}
      description="Choose a library revision to use in your résumé. Later library changes do not update your résumé automatically."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <FormField label="Search library">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </FormField>
        <Failure error={result.error} />
        {result.error && (
          <Button variant="outline" onClick={() => void result.refetch()}>
            Retry library search
          </Button>
        )}
        {result.isPending && <p>Loading library…</p>}
        {result.data?.items.map((entry) => (
          <label key={entry.item.id} className="flex items-start gap-3 rounded-sm border p-4">
            <input
              type="radio"
              name="library-choice"
              className="mt-1 size-4"
              checked={selected?.revisionId === entry.revision.id}
              onChange={() => setSelected({ itemId: entry.item.id, revisionId: entry.revision.id })}
            />
            <span>
              <span className="block font-medium">{entry.revision.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {entry.item.type} · Revision {entry.item.revision}
              </span>
              {entry.revision.data.kind === "content" && (
                <span className="mt-2 block whitespace-pre-wrap text-sm">
                  {entry.revision.data.wording}
                </span>
              )}
            </span>
          </label>
        ))}
        {result.data && !result.data.items.length && (
          <p className="text-sm text-muted-foreground">
            No compatible {kindLabels[kind].toLowerCase()} found. Create one in the library first.
          </p>
        )}
        {result.data && (offset > 0 || result.data.hasMore) && (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!result.data.hasMore}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        )}
        <Failure error={detail.error} />
        {detail.data && (
          <div className="space-y-5 border-t pt-5">
            <LibraryDataView data={detail.data.revision.data} graph={detail.data.graph} />
            <EvidenceLinks
              value={detail.data.evidence.map((ref) => ({
                claimId: ref.claimId,
                revisionId: ref.revisionId,
              }))}
            />
          </div>
        )}
        <div className="flex justify-end gap-3 border-t pt-5">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected || !detail.data}
            onClick={() => {
              if (selected && detail.data) onPick(selected, detail.data);
            }}
          >
            Use this revision
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
