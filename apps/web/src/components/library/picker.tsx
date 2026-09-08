import {
  type Composition,
  type ContentType,
  canonicalJson,
  type LibraryKind,
  type LibraryReference,
  placeBlock,
  placeSection,
  type StructuredContent,
} from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { requestResumePreview } from "~/server/composition-functions";
import { getLibrary } from "~/server/library-functions";
import { WorkingPreview } from "../composition/working-preview";
import { EvidenceLinks } from "./evidence-links";
import { StructuredFields } from "./schema-fields";
import { kindLabels, LibraryDataView, type LibraryDetail, useLibraryDetail } from "./shared";
export function LibraryPicker({
  kind,
  type,
  onClose,
  onPick,
  preview,
  initialReference,
}: {
  initialReference?: LibraryReference;
  kind: LibraryKind;
  type: ContentType | null;
  onClose: () => void;
  onPick: (
    ref: LibraryReference,
    detail: LibraryDetail,
    position?: number,
    structured?: StructuredContent,
  ) => void;
  preview?: { id: string; revision: number; data: Composition; sectionId?: string };
}) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const input = { kind, type, query, offset };
  const result = useQuery({
    queryKey: ["library", "search", input],
    queryFn: async () => unwrap(await getLibrary({ data: input })),
  });
  const [selected, setSelected] = useState<LibraryReference | null>(initialReference ?? null);
  const detail = useLibraryDetail(
    selected ? { id: selected.itemId, revisionId: selected.revisionId } : null,
  );
  const [edited, setEdited] = useState<{ revisionId: string; content: StructuredContent } | null>(
    null,
  );
  const selectedData = detail.data?.revision.data;
  const structured =
    edited?.revisionId === selected?.revisionId
      ? edited?.content
      : selectedData && selectedData.kind !== "content"
        ? selectedData.structured
        : undefined;
  const [position, setPosition] = useState(
    preview?.sectionId
      ? (preview.data.sections.find((section) => section.id === preview.sectionId)?.blocks.length ??
          0)
      : (preview?.data.sections.length ?? 0),
  );
  const [previewed, setPreviewed] = useState<string | null>(null);
  const previewData = preview?.data,
    previewSectionId = preview?.sectionId;
  const proposed = useMemo(() => {
    if (!previewData || !selected || !detail.data || kind === "content") return null;
    if (kind === "section") {
      const placed = placeSection(selected, detail.data.graph);
      const section = structured
        ? {
            ...placed,
            structured,
            heading:
              typeof structured.record.values.heading === "string"
                ? structured.record.values.heading
                : placed.heading,
            reason: "Added to this résumé",
          }
        : placed;
      const sections = [...previewData.sections];
      sections.splice(section.type === "contact" ? 0 : position, 0, section);
      return { ...previewData, sections };
    }
    const placed = placeBlock(selected, detail.data.graph);
    const block = structured ? { ...placed, structured, reason: "Added to this résumé" } : placed;
    return {
      ...previewData,
      sections: previewData.sections.map((section) => {
        if (section.id !== previewSectionId) return section;
        const blocks = [...section.blocks];
        blocks.splice(position, 0, block);
        return { ...section, reason: "Preview insertion", blocks };
      }),
    };
  }, [previewData, previewSectionId, selected, detail.data, kind, position, structured]);
  const previewIdentity = proposed ? canonicalJson(proposed) : null;
  return (
    <EvidenceDialog
      title={`Choose ${kindLabels[kind].toLowerCase()}`}
      description="Choose content and review it in your résumé before adding it."
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
              <span className="mt-1 block text-xs text-muted-foreground">{entry.item.type}</span>
              {entry.revision.data.kind === "content" && (
                <span className="mt-2 block line-clamp-2 text-sm">
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
            {detail.data.item.archivedAt !== null && (
              <p className="text-sm text-muted-foreground">
                This item was archived. Restore it in the Content library before reusing it.
              </p>
            )}
            {preview && structured && selected ? (
              <StructuredFields
                content={structured}
                onChange={(content) => setEdited({ revisionId: selected.revisionId, content })}
              />
            ) : (
              <LibraryDataView data={detail.data.revision.data} graph={detail.data.graph} />
            )}
            <EvidenceLinks
              value={detail.data.evidence.map((ref) => ({
                claimId: ref.claimId,
                revisionId: ref.revisionId,
              }))}
            />
          </div>
        )}
        {proposed && preview && (
          <section className="space-y-4 border-t pt-5">
            <FormField label="Position in this résumé">
              <select
                className="min-h-11 w-full rounded-sm border bg-background px-3"
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
              >
                {Array.from(
                  {
                    length:
                      (kind === "section"
                        ? preview.data.sections.length
                        : (preview.data.sections.find((section) => section.id === preview.sectionId)
                            ?.blocks.length ?? 0)) + 1,
                  },
                  (_, index) => index,
                ).map((position) => (
                  <option key={position} value={position}>
                    Position {position + 1}
                  </option>
                ))}
              </select>
            </FormField>
            <WorkingPreview
              identity={previewIdentity}
              request={async () =>
                unwrap(
                  await requestResumePreview({
                    data: {
                      id: preview.id,
                      revision: preview.revision,
                      data: proposed,
                      idempotencyKey: crypto.randomUUID(),
                    },
                  }),
                )
              }
              onReady={(identity) => setPreviewed(identity)}
            />
          </section>
        )}
        <div className="flex justify-end gap-3 border-t pt-5">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !selected ||
              !detail.data ||
              detail.data.item.archivedAt !== null ||
              Boolean(preview && previewed !== previewIdentity)
            }
            onClick={() => {
              if (selected && detail.data && detail.data.item.archivedAt === null)
                onPick(selected, detail.data, position, structured);
            }}
          >
            Add to résumé
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
