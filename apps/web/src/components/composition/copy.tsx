import type { CopyPlacementRequest } from "@river/contracts";
import { blockDefinitions, canonicalJson } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useDeferredValue, useRef, useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { copyResumePlacement, getResume, getResumes } from "~/server/composition-functions";
import type { PlacementPath } from "./reuse";
import type { ResumeDetail } from "./use-draft";
import { CompositionView } from "./view";
export function CopyDialog({
  detail,
  path,
  onClose,
}: {
  detail: ResumeDetail;
  path: PlacementPath;
  onClose: () => void;
}) {
  const [source] = useState(detail),
    [destination, setDestination] = useState<ResumeDetail | null>(null),
    [search, setSearch] = useState(""),
    query = useDeferredValue(search),
    [offset, setOffset] = useState(0),
    [currentJob, setCurrentJob] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const input = { jobId: currentJob ? source.draft.jobId : null, offset, query };
  const list = useQuery({
    queryKey: ["resumes", "destinations", input],
    queryFn: async () => unwrap(await getResumes({ data: input })),
  });
  const selection = useQuery({
    queryKey: ["resumes", "copy-detail", selected],
    enabled: selected !== null,
    queryFn: async () => {
      if (!selected) throw Error("Choose a draft.");
      return unwrap(await getResume({ data: { id: selected } }));
    },
  });
  const section = source.draft.data.sections.find((section) => section.id === path.sectionId);
  if (!section) return null;
  const block = section.blocks.find((block) => block.id === path.blockId),
    kind = block ? "Block" : "Section",
    preview = {
      ...source.draft.data,
      sections: [block ? { ...section, blocks: [block] } : section],
    };
  return (
    <EvidenceDialog
      title={`Copy ${kind.toLowerCase()} to a résumé`}
      description="A new placement preserves complete wording, local edits, and exact references. The destination uses its own template pack."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Source composition · draft revision {source.draft.revision}
          </summary>
          <div className="mt-4">
            <CompositionView data={preview} graph={source.graph} provenance />
          </div>
        </details>
        {destination ? (
          <ConfirmCopy
            key={destination.draft.id}
            source={source}
            destination={destination}
            path={path}
            onBack={() => setDestination(null)}
            onClose={onClose}
          />
        ) : (
          <>
            <FormField label="Search destination drafts and jobs">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </FormField>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={currentJob}
                onChange={(event) => {
                  setCurrentJob(event.target.checked);
                  setOffset(0);
                }}
              />
              Only drafts for this job
            </label>
            <Failure error={list.error} />
            {list.error && (
              <Button onClick={() => void list.refetch()}>Retry destination search</Button>
            )}
            {list.isPending && <p role="status">Loading drafts…</p>}
            {list.data?.items
              .filter((item) => item.id !== source.draft.id)
              .map((item) => (
                <label key={item.id} className="flex items-start gap-3 border-t py-4">
                  <input
                    className="mt-1"
                    type="radio"
                    name="copy-destination"
                    checked={selected === item.id}
                    onChange={() => setSelected(item.id)}
                  />
                  <span>
                    <span className="block font-semibold">{item.data.name}</span>
                    <span className="block text-sm">
                      {item.postingDetails.role} · {item.postingDetails.company}
                    </span>
                    <span className="eyebrow">
                      {item.data.theme} · Draft revision {item.revision} · Posting{" "}
                      {item.snapshotId.slice(-8)}
                    </span>
                  </span>
                </label>
              ))}
            {list.data && !list.data.items.filter((item) => item.id !== source.draft.id).length && (
              <p>No other destination drafts on this page.</p>
            )}
            {list.data && (offset > 0 || list.data.hasMore) && (
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
                  disabled={!list.data.hasMore}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next
                </Button>
              </div>
            )}
            <Failure error={selection.error} />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!selection.data || selection.isFetching}
                onClick={() => {
                  if (selection.data) setDestination(selection.data);
                }}
              >
                Choose destination
              </Button>
            </div>
          </>
        )}
      </div>
    </EvidenceDialog>
  );
}
function ConfirmCopy({
  source,
  destination,
  path,
  onBack,
  onClose,
}: {
  source: ResumeDetail;
  destination: ResumeDetail;
  path: PlacementPath;
  onBack: () => void;
  onClose: () => void;
}) {
  const sourceSection = source.draft.data.sections.find((section) => section.id === path.sectionId),
    block = sourceSection?.blocks.find((block) => block.id === path.blockId);
  const compatible = destination.draft.data.sections.filter(
    (section) =>
      section.type === block?.type && (section.type !== "contact" || !section.blocks.length),
  );
  const [sectionId, setSectionId] = useState<string>(compatible[0]?.id ?? ""),
    [position, setPosition] = useState(
      block || sourceSection?.type === "contact" ? 0 : destination.draft.data.sections.length,
    ),
    [done, setDone] = useState(false);
  const client = useQueryClient(),
    retry = useRef<{ payload: string; key: string } | null>(null),
    target = compatible.find((section) => section.id === sectionId);
  const max = block ? (target?.blocks.length ?? 0) : destination.draft.data.sections.length;
  const mutation = useMutation({
    mutationFn: async () => {
      const input: Omit<CopyPlacementRequest, "idempotencyKey"> = {
        sourceId: source.draft.id,
        sourceRevision: source.draft.revision,
        destinationId: destination.draft.id,
        destinationRevision: destination.draft.revision,
        sectionId: path.sectionId,
        blockId: path.blockId,
        destinationSectionId: block ? sectionId : null,
        position,
      };
      const payload = canonicalJson(input);
      if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await copyResumePlacement({ data: { ...input, idempotencyKey: retry.current.key } }),
      );
    },
    onSuccess: async () => {
      setDone(true);
      await client.invalidateQueries({ queryKey: ["resumes"] });
    },
  });
  if (done)
    return (
      <div className="space-y-4">
        <p role="status">
          Copied into {destination.draft.data.name}. The source draft is unchanged.
        </p>
        <Button asChild>
          <Link to="/resumes/$resumeId" params={{ resumeId: destination.draft.id }}>
            Open destination draft
          </Link>
        </Button>
        <Button variant="outline" onClick={onClose}>
          Return to source
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-editorial text-2xl">{destination.draft.data.name}</h3>
        <p className="text-sm">
          {destination.snapshot.details.role} · {destination.snapshot.details.company}
        </p>
        <p className="eyebrow">
          Draft revision {destination.draft.revision} · {destination.draft.data.theme} · Posting{" "}
          {destination.snapshot.id.slice(-8)}
        </p>
      </div>
      {block &&
        (compatible.length ? (
          <FormField label="Destination Section">
            <select
              className={selectClass}
              value={sectionId}
              onChange={(event) => {
                setSectionId(event.target.value);
                setPosition(0);
              }}
            >
              {compatible.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.heading || "Contact / header"} · {blockDefinitions[section.type].label}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <p className="border-l-2 border-warning p-4 text-sm">
            This draft has no compatible destination Section. Choose another draft, or open it and
            add a {blockDefinitions[block.type].label} Section first.
          </p>
        ))}
      {(!block || target) && (
        <FormField label="Insert position">
          <select
            className={selectClass}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
          >
            {Array.from({ length: max + 1 }, (_, index) => index).map((index) => (
              <option
                key={index}
                value={index}
                disabled={
                  !block &&
                  sourceSection?.type !== "contact" &&
                  index === 0 &&
                  destination.draft.data.sections[0]?.type === "contact"
                }
              >
                {index === 0
                  ? "At the beginning"
                  : index === max
                    ? "At the end"
                    : `After item ${index}`}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <Failure error={mutation.error} />
      {mutation.error && (
        <p className="text-sm">
          If either draft changed, return to destination selection and review the current versions.
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="outline" disabled={mutation.isPending} onClick={onBack}>
          Choose another destination
        </Button>
        <Button
          disabled={mutation.isPending || Boolean(block && !target)}
          onClick={() => mutation.mutate()}
        >
          Copy {block ? "block" : "section"}
        </Button>
      </div>
    </div>
  );
}
