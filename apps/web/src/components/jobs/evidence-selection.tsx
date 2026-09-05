import type { EvidenceSearch } from "@river/contracts";
import { type EvidenceSelection, selectionIdentity } from "@river/domain";
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
import type { JobDetail } from "./shared";
export type Choice = { selection: EvidenceSelection; selected: boolean; assertion: string };
export function EvidenceSearchPanel({
  detail,
  requirementId,
  readOnly,
  busy,
  pending,
  onChoose,
  onInspect,
}: {
  detail: JobDetail;
  requirementId: string | null;
  readOnly: boolean;
  busy: boolean;
  pending: Choice | null;
  onChoose: (choice: Choice) => void;
  onInspect: (selection: EvidenceSelection) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EvidenceSearch["status"]>("All");
  const [archived, setArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = useDeferredValue(search);
  const input = { query, status, archived: archived ? null : false, contextId: null, offset };
  const matches = useQuery({
    queryKey: ["evidence", "search", input],
    queryFn: async () => unwrap(await getEvidence({ data: input })),
    placeholderData: (previous) => previous,
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <FormField label="Search evidence">
            <Input
              placeholder="Search assertions, tags, or context"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </FormField>
        </div>
        <div className="w-44">
          <FormField label="Review status">
            <select
              className={selectClass}
              value={status}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "All" ||
                  value === "Draft" ||
                  value === "Needs clarification" ||
                  value === "Verified"
                )
                  setStatus(value);
                setOffset(0);
              }}
            >
              {["All", "Draft", "Needs clarification", "Verified"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </FormField>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={archived}
          onChange={(event) => {
            setArchived(event.target.checked);
            setOffset(0);
          }}
        />
        Include archived evidence
      </label>
      <Failure error={matches.error} />
      {matches.error && (
        <Button variant="outline" onClick={() => void matches.refetch()}>
          Retry evidence search
        </Button>
      )}
      {matches.isPending && <p role="status">Loading evidence…</p>}
      {matches.data?.items.map((claim) => {
        const selection = {
          claimId: claim.id,
          evidenceRevisionId: claim.currentRevisionId,
          requirementId,
        };
        const saved = detail.selected.find(
          (s) => selectionIdentity(s) === selectionIdentity(selection),
        );
        const choice =
          pending && selectionIdentity(pending.selection) === selectionIdentity(selection)
            ? pending
            : null;
        const checked = choice ? choice.selected : Boolean(saved);
        const shown = saved ?? {
          ...selection,
          assertion: claim.assertion,
          reviewState: claim.reviewState,
          issues: claim.archivedAt ? ["Archived"] : [],
        };
        return (
          <article key={claim.id} className="flex gap-3 border-b py-4">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-primary"
              checked={checked}
              disabled={readOnly || busy}
              aria-label={`Select ${shown.assertion} for ${requirementId ? "this requirement" : "this job"}`}
              onChange={(event) =>
                onChoose({
                  selection: saved ?? selection,
                  selected: event.target.checked,
                  assertion: shown.assertion,
                })
              }
            />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="outline">{shown.reviewState}</Badge>
                {shown.issues
                  .filter((issue) => issue !== shown.reviewState)
                  .map((issue) => (
                    <Badge key={issue} variant="outline">
                      {issue}
                    </Badge>
                  ))}
                {choice && <Badge variant="outline">{busy ? "Saving" : "Not saved"}</Badge>}
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-[23px] break-words">
                {shown.assertion}
              </p>
              <Button
                className="mt-2 h-auto min-h-11 px-0 whitespace-normal text-left"
                variant="link"
                onClick={() => onInspect(saved ?? selection)}
              >
                Inspect citation and verification
              </Button>
            </div>
          </article>
        );
      })}
      {matches.data && !matches.data.items.length && (
        <p className="py-6 text-sm text-muted-foreground">
          No matching evidence. This requirement remains a gap until you select supporting evidence.
        </p>
      )}
      {matches.data && (offset > 0 || matches.data.hasMore) && (
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
            disabled={!matches.data.hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
export function SelectedEvidence({
  detail,
  requirementId,
  readOnly,
  busy,
  onChoose,
  onInspect,
}: {
  detail: JobDetail;
  requirementId?: string | null;
  readOnly: boolean;
  busy: boolean;
  onChoose: (choice: Choice) => void;
  onInspect: (selection: EvidenceSelection) => void;
}) {
  const items = detail.selected.filter(
    (item) => requirementId === undefined || item.requirementId === requirementId,
  );
  return (
    <div>
      {items.map((item) => (
        <article key={selectionIdentity(item)} className="space-y-3 border-b py-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{item.reviewState}</Badge>
            {item.issues
              .filter((issue) => issue !== item.reviewState)
              .map((issue) => (
                <Badge key={issue} variant="outline">
                  {issue}
                </Badge>
              ))}
          </div>
          <p className="text-[15px] leading-[23px] whitespace-pre-wrap break-words">
            {item.assertion}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.requirementId
              ? `Requirement: ${detail.workspace.data.requirements.find((r) => r.id === item.requirementId)?.text ?? "Historical requirement"}`
              : "General job selection"}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="link"
              className="min-h-11 px-0 whitespace-normal text-left"
              onClick={() => onInspect(item)}
            >
              Inspect citation and verification
            </Button>
            {!readOnly && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  onChoose({
                    selection: {
                      claimId: item.claimId,
                      evidenceRevisionId: item.evidenceRevisionId,
                      requirementId: item.requirementId,
                    },
                    selected: false,
                    assertion: item.assertion,
                  })
                }
              >
                Remove association
              </Button>
            )}
          </div>
        </article>
      ))}
      {!items.length && (
        <p className="py-5 text-sm text-muted-foreground">
          {requirementId ? "Gap · no evidence selected" : "No evidence selected for this view."}
        </p>
      )}
    </div>
  );
}
export function JobEvidenceInspector({
  selection,
  readOnly,
  busy,
  onClose,
  onChoose,
  allowSelection = false,
}: {
  selection: EvidenceSelection;
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  onChoose: (choice: Choice) => void;
  allowSelection?: boolean;
}) {
  const evidence = useEvidenceDetail(selection.claimId);
  const [compare, setCompare] = useState(false);
  const selected = evidence.data?.revisions.find((r) => r.id === selection.evidenceRevisionId);
  const current = evidence.data?.revisions.find(
    (r) => r.id === evidence.data?.claim.currentRevisionId,
  );
  const stale = current?.id !== selection.evidenceRevisionId;
  return (
    <EvidenceDialog
      title="Evidence provenance"
      description="Inspect the exact wording, source passages, and review decisions for this selection."
      onClose={onClose}
      wide
      pending={busy}
    >
      <Failure error={evidence.error} />
      {evidence.isPending && <p>Loading evidence…</p>}
      {evidence.data && (
        <>
          {stale && (
            <div className="mb-5 space-y-3 rounded-sm border p-4">
              <p className="text-sm">
                A newer evidence revision is available. This selection keeps its original wording.
              </p>
              <Button variant="outline" onClick={() => setCompare(!compare)}>
                {compare ? "Close comparison" : "Compare revisions"}
              </Button>
              {compare && (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <p className="eyebrow">Selected revision</p>
                      <MaterialSummary
                        material={selected?.material}
                        contexts={evidence.data.contexts}
                      />
                    </div>
                    <div>
                      <p className="eyebrow">
                        Current revision · {evidence.data.claim.reviewState}
                      </p>
                      <MaterialSummary
                        material={current?.material}
                        contexts={evidence.data.contexts}
                      />
                    </div>
                  </div>
                  {!readOnly && current && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        onChoose({
                          selection: { ...selection, evidenceRevisionId: current.id },
                          selected: true,
                          assertion: current.material.assertion,
                        });
                        onClose();
                      }}
                    >
                      Use current revision for this association
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          <EvidenceInspector
            key={selection.evidenceRevisionId}
            detail={evidence.data}
            initialRevisionId={selection.evidenceRevisionId}
          />
          {allowSelection && !readOnly && selected && (
            <div className="mt-5 space-y-3 border-t pt-5">
              <p className="text-sm">
                Choose the exact evidence revision shown above for this association.
                {stale && " This is an older revision; its wording remains unchanged."}
                {evidence.data.claim.archivedAt && " This evidence is currently archived."}
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  onChoose({ selection, selected: true, assertion: selected.material.assertion });
                  onClose();
                }}
              >
                Choose this exact revision
              </Button>
            </div>
          )}
        </>
      )}
    </EvidenceDialog>
  );
}
