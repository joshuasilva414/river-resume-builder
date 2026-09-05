import type { ApplyLibraryRequest } from "@river/contracts";
import {
  type CommandOutcome,
  type Composition,
  canonicalJson,
  contentValue,
  type EvidenceReference,
  type LibraryData,
  type LibraryReference,
} from "@river/domain";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import {
  kindLabels,
  LibraryDataView,
  type LibraryDetail,
  type LibraryNode,
  useLibraryCommand,
  useLibraryDetail,
} from "~/components/library/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { applyResumeLibraryUpdate } from "~/server/composition-functions";
import type { ResumeDetail } from "./use-draft";
import { CompositionView } from "./view";

function evidenceOf(
  data: LibraryData,
  graph: readonly LibraryNode[],
): readonly EvidenceReference[] {
  if (data.kind === "content") return data.evidence;
  const children =
    data.kind === "block" ? data.fields.flatMap((field) => field.contents) : data.blocks;
  const refs = children.flatMap((ref) => {
    const node = graph.find(
      (node) => node.revision.id === ref.revisionId && node.item.id === ref.itemId,
    );
    return node ? evidenceOf(node.revision.data, graph) : [];
  });
  return [...new Map(refs.map((ref) => [`${ref.claimId}:${ref.revisionId}`, ref])).values()];
}
export interface PlacementPath {
  sectionId: string;
  blockId: string | null;
  contentId: string | null;
}
function scope(data: Composition, path: PlacementPath, graph: readonly LibraryNode[]) {
  const section = data.sections.find((value) => value.id === path.sectionId);
  if (!section) throw Error("Section unavailable");
  const block = section.blocks.find((value) => value.id === path.blockId);
  const content = block?.fields
    .flatMap((field) => field.contents)
    .find((value) => value.id === path.contentId);
  let library: LibraryData,
    reference: LibraryReference,
    unresolved = 0,
    local = false;
  if (content) {
    library = contentValue(content, graph);
    reference = content.reference;
    local = content.override !== null;
  } else if (block) {
    library = {
      kind: "block",
      type: block.type,
      fields: block.fields.map((field) => ({
        key: field.key,
        contents: field.contents.map((content) => ({ id: content.id, ...content.reference })),
      })),
    };
    reference = block.reference;
    unresolved = block.fields
      .flatMap((field) => field.contents)
      .filter((content) => content.override !== null).length;
    local = block.reason !== null || unresolved > 0;
  } else {
    library = {
      kind: "section",
      type: section.type,
      heading: section.heading,
      blocks: section.blocks.map((block) => ({ id: block.id, ...block.reference })),
    };
    reference = section.reference;
    unresolved = section.blocks.filter(
      (block) =>
        block.reason !== null ||
        block.fields.some((field) => field.contents.some((content) => content.override !== null)),
    ).length;
    local = section.reason !== null || unresolved > 0;
  }
  const preview = {
    ...data,
    sections: [
      block
        ? {
            ...section,
            blocks: [
              content
                ? {
                    ...block,
                    fields: block.fields.map((field) => ({
                      ...field,
                      contents: field.contents.filter((value) => value.id === content.id),
                    })),
                  }
                : block,
            ],
          }
        : section,
    ],
  };
  return { library, reference, unresolved, local, preview };
}
export function ReuseDialog({
  detail,
  path,
  onClose,
  onApplied,
}: {
  detail: ResumeDetail;
  path: PlacementPath;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const selected = scope(detail.draft.data, path, detail.graph),
    result = useLibraryDetail({ id: selected.reference.itemId });
  return (
    <>
      {result.error && (
        <EvidenceDialog
          title="Inspect reuse"
          description="Load the library revision before comparing or promoting."
          onClose={onClose}
        >
          <Failure error={result.error} />
          <Button onClick={() => void result.refetch()}>Retry</Button>
        </EvidenceDialog>
      )}
      {result.isPending && (
        <EvidenceDialog
          title="Inspect reuse"
          description="Loading exact reusable revisions…"
          onClose={onClose}
        >
          <p role="status">Loading…</p>
        </EvidenceDialog>
      )}
      {result.data && (
        <ReadyReuse
          detail={detail}
          path={path}
          library={result.data}
          onClose={onClose}
          onApplied={onApplied}
        />
      )}
    </>
  );
}
function ReadyReuse(props: {
  detail: ResumeDetail;
  path: PlacementPath;
  library: LibraryDetail;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const [snapshot] = useState({ detail: props.detail, path: props.path, library: props.library }),
    { detail, path, library } = snapshot;
  const selected = scope(detail.draft.data, path, detail.graph);
  const [mode, setMode] = useState<"revision" | "new">("new"),
    [label, setLabel] = useState(library.revision.label),
    [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [replaceLocal, setReplaceLocal] = useState(false),
    [saved, setSaved] = useState<CommandOutcome | null>(null);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  const save = useLibraryCommand((outcome) => {
    setSaved(outcome);
    setReplaceLocal(false);
  });
  const apply = useMutation({
    mutationFn: async () => {
      const input: Omit<ApplyLibraryRequest, "idempotencyKey"> = {
        id: detail.draft.id,
        revision: detail.draft.revision,
        ...path,
        reference: saved?.revisionId
          ? { itemId: saved.id, revisionId: saved.revisionId }
          : { itemId: library.item.id, revisionId: library.revision.id },
        libraryRevision: saved?.revision ?? library.item.revision,
        replaceLocal,
      };
      const payload = canonicalJson(input);
      if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await applyResumeLibraryUpdate({ data: { ...input, idempotencyKey: retry.current.key } }),
      );
    },
    onSuccess: async () => {
      await props.onApplied();
      props.onClose();
    },
  });
  const candidate = saved ? selected.library : library.revision.data,
    candidateGraph = saved ? detail.graph : library.graph;
  const changed = selected.reference.revisionId !== library.revision.id;
  return (
    <EvidenceDialog
      title="Inspect reuse and compare revisions"
      description="Review complete wording, ordering, and evidence. Library saves and applying a revision are separate actions."
      onClose={props.onClose}
      pending={save.isPending || apply.isPending}
      wide
    >
      <div className="space-y-6">
        <p className="eyebrow break-all">
          Base {kindLabels[selected.library.kind]} · {selected.reference.revisionId}
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4">
            <p className="eyebrow">Current placement · saved draft {detail.draft.revision}</p>
            <CompositionView data={selected.preview} graph={detail.graph} provenance />
          </section>
          <section className="space-y-4 border-l pl-4">
            <p className="eyebrow">
              {saved ? "Explicitly saved library revision" : "Current library revision"}{" "}
              {saved?.revision ?? library.item.revision}
            </p>
            <LibraryDataView data={candidate} graph={candidateGraph} />
            <EvidenceLinks value={evidenceOf(candidate, candidateGraph)} />
          </section>
        </div>
        {(changed || saved) && (
          <section className="space-y-4 border-y py-5">
            <h3 className="font-editorial text-2xl">Apply reviewed library revision</h3>
            {selected.local && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={replaceLocal}
                  onChange={(event) => setReplaceLocal(event.target.checked)}
                />
                I reviewed all local wording, ordering, and evidence changes this revision replaces.
              </label>
            )}
            <Failure error={apply.error} />
            <Button
              disabled={apply.isPending || (selected.local && !replaceLocal)}
              onClick={() => apply.mutate()}
            >
              Apply this exact revision
            </Button>
            <p className="text-xs text-muted-foreground">
              A changed server draft or library item stops this action. Close and reopen to review
              fresh values.
            </p>
          </section>
        )}
        {!saved && (
          <section className="space-y-4">
            <h3 className="font-editorial text-2xl">Save local changes to the library</h3>
            {selected.unresolved > 0 ? (
              <div className="space-y-3 border-l-2 border-warning p-4">
                <p>
                  {selected.unresolved} child{" "}
                  {selected.library.kind === "section" ? "Blocks have" : "wording bindings have"}{" "}
                  local changes.
                </p>
                <p className="text-sm">
                  First save each changed child as a new item or revision, then explicitly apply
                  that revision to its placement. Return here after every child is bound. Previously
                  saved children remain if you cancel.
                </p>
              </div>
            ) : (
              <>
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-sm font-semibold">Reuse choice</legend>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="promotion-mode"
                      checked={mode === "new"}
                      onChange={() => {
                        setMode("new");
                        setReviewed(false);
                      }}
                    />
                    New reusable item for a distinct alternative
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="promotion-mode"
                      checked={mode === "revision"}
                      onChange={() => {
                        setMode("revision");
                        setReviewed(false);
                      }}
                    />
                    New revision of {library.item.label}
                  </label>
                </fieldset>
                <FormField label="Library label">
                  <Input
                    value={label}
                    maxLength={160}
                    onChange={(event) => {
                      setLabel(event.target.value);
                      setReviewed(false);
                    }}
                  />
                </FormField>
                <FormField label="Revision note">
                  <Textarea
                    value={reason}
                    maxLength={4000}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setReviewed(false);
                    }}
                  />
                </FormField>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  I reviewed the full current placement and its evidence above for this reusable
                  version.
                </label>
                <Failure error={save.error} />
                <Button
                  disabled={!reviewed || !label.trim() || !reason.trim() || save.isPending}
                  onClick={() =>
                    save.mutate({
                      id: mode === "revision" ? library.item.id : null,
                      revision: mode === "revision" ? library.item.revision : null,
                      label,
                      rationale: reason,
                      data: selected.library,
                    })
                  }
                >
                  {mode === "revision" ? "Save new library revision" : "Create reusable item"}
                </Button>
              </>
            )}
          </section>
        )}
        {saved && (
          <p role="status" className="border-l-2 border-primary p-4 text-sm">
            Saved library revision {saved.revision}. This placement still has its previous
            references until you explicitly apply the saved revision above.
          </p>
        )}
        <Button variant="outline" onClick={props.onClose}>
          Keep current placement and close
        </Button>
      </div>
    </EvidenceDialog>
  );
}
