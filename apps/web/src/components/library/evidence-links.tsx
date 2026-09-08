import { type EvidenceReference, EvidenceType } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { EvidenceInspector } from "~/components/evidence/inspector";
import {
  EvidenceDialog,
  Failure,
  FormField,
  MaterialSummary,
  selectClass,
  unwrap,
  useEvidenceDetail,
} from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getEvidence } from "~/server/evidence-functions";

export function EvidenceLinks({
  value,
  onChange,
}: {
  value: readonly EvidenceReference[];
  onChange?: (refs: readonly EvidenceReference[]) => void;
}) {
  const [choose, setChoose] = useState(false);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-semibold">Supporting evidence</h3>
        {onChange && (
          <Button
            type="button"
            variant="outline"
            disabled={value.length >= 20}
            onClick={() => setChoose(true)}
          >
            Choose evidence
          </Button>
        )}
      </div>
      {!value.length && (
        <p className="text-sm text-muted-foreground">No evidence linked. Links are optional.</p>
      )}
      {value.map((reference) => (
        <EvidenceLink
          key={`${reference.claimId}:${reference.revisionId}`}
          reference={reference}
          onRemove={
            onChange
              ? () => onChange(value.filter((ref) => ref.claimId !== reference.claimId))
              : undefined
          }
          onReplace={
            onChange
              ? (ref) => onChange(value.map((item) => (item.claimId === ref.claimId ? ref : item)))
              : undefined
          }
        />
      ))}
      {choose && onChange && (
        <EvidencePicker
          value={value}
          onClose={() => setChoose(false)}
          onPick={(ref) => {
            onChange([...value.filter((item) => item.claimId !== ref.claimId), ref]);
            setChoose(false);
          }}
        />
      )}
    </section>
  );
}
function EvidenceLink({
  reference,
  onRemove,
  onReplace,
}: {
  reference: EvidenceReference;
  onRemove?: () => void;
  onReplace?: (ref: EvidenceReference) => void;
}) {
  const result = useEvidenceDetail(reference.claimId);
  const [inspect, setInspect] = useState(false);
  const [compare, setCompare] = useState(false);
  const detail = result.data;
  const selected = detail?.revisions.find((r) => r.id === reference.revisionId);
  const current = detail?.revisions.find((r) => r.id === detail.claim.currentRevisionId);
  const stale = detail && reference.revisionId !== detail.claim.currentRevisionId;
  return (
    <article className="space-y-3 rounded-sm border p-4">
      <Failure error={result.error} />
      {result.isPending && <p>Loading linked evidence…</p>}
      {detail && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{detail.claim.metadata.type ?? "Other"}</Badge>
            {stale && <Badge variant="outline">Evidence changed</Badge>}
            {detail.claim.archivedAt && <Badge variant="outline">In Trash</Badge>}
          </div>
          <p className="text-sm whitespace-pre-wrap">
            {selected?.material.assertion ?? "The linked evidence is unavailable."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="link" className="px-0" onClick={() => setInspect(true)}>
              View evidence
            </Button>
            {onRemove && (
              <Button type="button" variant="ghost" onClick={onRemove}>
                Remove link
              </Button>
            )}
            {stale && onReplace && (
              <Button type="button" variant="outline" onClick={() => setCompare(true)}>
                Compare current evidence
              </Button>
            )}
          </div>
        </>
      )}
      {inspect && detail && (
        <EvidenceDialog
          title="Evidence"
          description="The evidence saved with this wording."
          onClose={() => setInspect(false)}
          wide
        >
          <EvidenceInspector detail={detail} initialRevisionId={reference.revisionId} />
        </EvidenceDialog>
      )}
      {compare && detail && current && (
        <EvidenceDialog
          title="Compare evidence"
          description="Choose which saved evidence to use with this wording."
          onClose={() => setCompare(false)}
          wide
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Linked evidence</p>
              <MaterialSummary material={selected?.material} contexts={detail.contexts} />
            </div>
            <div>
              <p className="eyebrow">Current evidence</p>
              <MaterialSummary material={current.material} contexts={detail.contexts} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setCompare(false)}>
              Keep linked evidence
            </Button>
            <Button
              onClick={() => {
                onReplace?.({ claimId: reference.claimId, revisionId: current.id });
                setCompare(false);
              }}
            >
              Use current evidence
            </Button>
          </div>
        </EvidenceDialog>
      )}
    </article>
  );
}
function EvidencePicker({
  value,
  onClose,
  onPick,
}: {
  value: readonly EvidenceReference[];
  onClose: () => void;
  onPick: (ref: EvidenceReference) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [type, setType] = useState<EvidenceType>();
  const [archived, setArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const input = {
    query,
    type,
    status: "All" as const,
    archived: archived ? null : false,
    contextId: null,
    offset,
  };
  const results = useQuery({
    queryKey: ["evidence", "search", input],
    queryFn: async () => unwrap(await getEvidence({ data: input })),
  });
  const [selected, setSelected] = useState<EvidenceReference | null>(null);
  const detail = useEvidenceDetail(selected?.claimId ?? null);
  return (
    <EvidenceDialog
      title="Choose supporting evidence"
      description="Choose saved evidence to support your wording."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Search evidence">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </FormField>
          <FormField label="Type">
            <select
              className={selectClass}
              value={type ?? ""}
              onChange={(event) => {
                setType(EvidenceType.literals.find((item) => item === event.target.value));
                setOffset(0);
              }}
            >
              <option value="">All types</option>
              {EvidenceType.literals.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </FormField>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => {
              setArchived(event.target.checked);
              setOffset(0);
            }}
          />
          Include evidence in Trash
        </label>
        <Failure error={results.error} />
        {results.error && (
          <Button variant="outline" onClick={() => void results.refetch()}>
            Retry search
          </Button>
        )}
        {results.isPending && <p>Loading evidence…</p>}
        <div className="space-y-3">
          {results.data?.items.map((claim) => (
            <label key={claim.id} className="flex items-start gap-3 rounded-sm border p-4">
              <input
                type="radio"
                name="library-evidence"
                className="mt-1 size-4 shrink-0"
                checked={selected?.claimId === claim.id}
                disabled={value.some((ref) => ref.claimId === claim.id)}
                onChange={() =>
                  setSelected({ claimId: claim.id, revisionId: claim.currentRevisionId })
                }
              />
              <span className="min-w-0">
                <span className="block whitespace-pre-wrap text-sm">{claim.assertion}</span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {claim.metadata.type ?? "Other"}
                  {claim.archivedAt ? " · In Trash" : ""}
                  {value.some((ref) => ref.claimId === claim.id) ? " · Already linked" : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
        {results.data && !results.data.items.length && (
          <p className="text-sm text-muted-foreground">No matching evidence.</p>
        )}
        {results.data && (offset > 0 || results.data.hasMore) && (
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
              disabled={!results.data.hasMore}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        )}
        <Failure error={detail.error} />
        {selected && detail.data && (
          <div className="border-t pt-5">
            <EvidenceInspector
              key={selected.revisionId}
              detail={detail.data}
              initialRevisionId={selected.revisionId}
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
              if (selected && detail.data) onPick(selected);
            }}
          >
            Link evidence
          </Button>
        </div>
      </div>
    </EvidenceDialog>
  );
}
