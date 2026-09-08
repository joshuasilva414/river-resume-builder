import {
  adaptLibraryContent,
  type ContentRecord,
  type EvidenceReference,
  type SchemaReference,
  sameSchema,
  schemaKey,
  upgradeBuiltInContent,
} from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getLibrary, getLibraryDetail } from "~/server/library-functions";

export function SavedEntryPicker({
  schema,
  layout,
  onPick,
  disabled,
}: {
  schema: SchemaReference;
  layout: SchemaReference;
  onPick: (record: ContentRecord, evidence: readonly EvidenceReference[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0),
    [error, setError] = useState<Error | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const epoch = useRef(0),
    mounted = useRef(true),
    latest = useRef({ open, disabled, schema, layout, onPick });
  latest.current = { open, disabled, schema, layout, onPick };
  const target = `${schemaKey(schema)}:${schemaKey(layout)}`;
  const previousTarget = useRef(target);
  useEffect(() => {
    if (previousTarget.current === target) return;
    previousTarget.current = target;
    epoch.current++;
    setPendingId(null);
    setError(null);
  }, [target]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  const query = useQuery({
    queryKey: ["saved-schema-entries", schema, offset],
    enabled: open,
    queryFn: async () =>
      unwrap(await getLibrary({ data: { kind: "block", type: null, query: "", offset } })),
  });
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          epoch.current++;
          setPendingId(null);
          setError(null);
          setOpen(!open);
        }}
      >
        {open ? "Close saved entries" : "Use saved entry"}
      </Button>
      {open && (
        <>
          <Failure error={query.error ?? error} />
          {query.data?.items
            .filter(
              (item) =>
                item.revision.data.kind === "block" &&
                (item.revision.data.structured
                  ? sameSchema(
                      upgradeBuiltInContent(item.revision.data.structured).record.schema,
                      schema,
                    )
                  : `${item.item.type}-entry` === schema.id),
            )
            .map((item) => (
              <div
                className="flex items-center justify-between gap-3 rounded-sm border p-3"
                key={item.item.id}
              >
                <span className="text-sm">{item.revision.label}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || pendingId !== null}
                  onClick={() => {
                    const attempt = ++epoch.current;
                    const current = () =>
                      mounted.current &&
                      epoch.current === attempt &&
                      latest.current.open &&
                      !latest.current.disabled &&
                      `${schemaKey(latest.current.schema)}:${schemaKey(latest.current.layout)}` ===
                        target;
                    setPendingId(item.item.id);
                    setError(null);
                    void getLibraryDetail({
                      data: { id: item.item.id, revisionId: item.revision.id },
                    })
                      .then(unwrap)
                      .then((detail) => {
                        if (!current()) return;
                        if (detail.item.archivedAt !== null)
                          throw new Error("This entry is in Trash. Restore it before adding it.");
                        const content = adaptLibraryContent(
                          detail.revision.data,
                          detail.graph,
                          detail.item.id,
                        );
                        if (!sameSchema(content.record.schema, latest.current.schema))
                          throw new Error(
                            "This saved entry uses different fields. Choose a compatible entry.",
                          );
                        latest.current.onPick(
                          { ...content.record, id: detail.item.id, layout: latest.current.layout },
                          content.evidence,
                        );
                        setOpen(false);
                      })
                      .catch((problem: unknown) => {
                        if (current())
                          setError(
                            problem instanceof Error
                              ? problem
                              : new Error("Could not load the entry."),
                          );
                      })
                      .finally(() => {
                        if (mounted.current && epoch.current === attempt) setPendingId(null);
                      });
                  }}
                >
                  {pendingId === item.item.id && <LoaderCircle className="size-4 animate-spin" />}
                  {pendingId === item.item.id ? "Loading entry…" : "Use entry"}
                </Button>
              </div>
            ))}
          <div className="flex gap-2">
            {offset > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || pendingId !== null}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
            )}
            {query.data?.hasMore && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || pendingId !== null}
                onClick={() => setOffset(offset + 50)}
              >
                More entries
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
