import type { ReviewedComparisonOrigin, SourceCandidateOrigin } from "@river/contracts";
import { canonicalJson, type EvidenceMaterialInput } from "@river/domain";
import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { CitationPicker } from "./citation-picker";
import { ContextForm } from "./context-form";
import {
  Conflict,
  type EvidenceDetail,
  EvidenceDialog,
  FormField,
  MaterialSummary,
  selectClass,
  useContexts,
  useEvidenceCommand,
} from "./shared";

function materialOf(detail?: EvidenceDetail): EvidenceMaterialInput {
  const material = detail?.revisions.find((r) => r.id === detail.claim.currentRevisionId)?.material;
  return {
    assertion: material?.assertion ?? "",
    contexts: material?.contexts ?? [],
    citations:
      material?.citations.map(({ sourceId, processingId, start, end, quote }) => ({
        sourceId,
        processingId,
        start,
        end,
        quote,
      })) ?? [],
  };
}
export function ClaimEditor({
  detail,
  mergeSource,
  initialMaterial,
  originCandidate,
  comparisonOrigin,
  onClose,
  onSaved,
}: {
  detail?: EvidenceDetail;
  mergeSource?: EvidenceDetail;
  initialMaterial?: EvidenceMaterialInput;
  originCandidate?: SourceCandidateOrigin;
  comparisonOrigin?: ReviewedComparisonOrigin;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [observed, setObserved] = useState(detail);
  const [observedSource, setObservedSource] = useState(mergeSource);
  const [mode, setMode] = useState<"claim" | "citation" | "context">("claim");
  const [contextDirty, setContextDirty] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const addCitation = useRef<HTMLButtonElement>(null);
  const contexts = useContexts();
  const initial = detail ? materialOf(detail) : (initialMaterial ?? materialOf());
  const sourceMaterial = materialOf(mergeSource);
  const startingMaterial = mergeSource
    ? {
        ...initial,
        citations: [...initial.citations, ...sourceMaterial.citations].filter(
          (c, i, a) => a.findIndex((other) => canonicalJson(c) === canonicalJson(other)) === i,
        ),
        contexts: [
          ...initial.contexts,
          ...sourceMaterial.contexts.filter(
            (c) => !initial.contexts.some((other) => other.id === c.id),
          ),
        ],
      }
    : initial;
  const save = useEvidenceCommand((result) => {
    onSaved(result.id);
    onClose();
  });
  const form = useForm({
    defaultValues: { material: startingMaterial, rationale: "" },
    onSubmit: ({ value }) => {
      if (observed && observedSource)
        save.mutate({
          type: "merge",
          ...(comparisonOrigin ? { comparisonOrigin } : {}),
          id: observed.claim.id,
          revision: observed.claim.revision,
          sourceId: observedSource.claim.id,
          sourceRevision: observedSource.claim.revision,
          material: value.material,
          rationale: value.rationale,
        });
      else if (observed)
        save.mutate({
          type: "edit",
          id: observed.claim.id,
          revision: observed.claim.revision,
          material: value.material,
        });
      else
        save.mutate({
          type: "create",
          ...(originCandidate ? { originCandidate } : {}),
          material: value.material,
          metadata: { label: "", tags: [], notes: "" },
        });
    },
  });
  const returnToClaim = () => {
    setContextDirty(false);
    setMode("claim");
    requestAnimationFrame(() => addCitation.current?.focus());
  };
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(value) => (
        <EvidenceDialog
          title={
            mode === "citation"
              ? "Select a supporting excerpt"
              : mode === "context"
                ? "New context"
                : mergeSource
                  ? "Compare and merge claims"
                  : observed
                    ? "Edit claim"
                    : "New claim"
          }
          description={
            mode === "citation"
              ? "Choose an exact passage from a preserved extraction."
              : mode === "context"
                ? "Save the background behind related claims."
                : mergeSource
                  ? "Review both claims and the resulting new Draft revision."
                  : originCandidate
                    ? "Save an independent manual Draft. The originating candidate remains Pending and can be reviewed separately."
                    : "Keep one factual assertion with the evidence that supports it."
          }
          wide={Boolean(mergeSource) || mode === "citation"}
          dirty={
            mode === "context"
              ? contextDirty
              : mode === "claim" &&
                canonicalJson(value) !==
                  canonicalJson({ material: startingMaterial, rationale: "" })
          }
          pending={save.isPending || contextBusy}
          onClose={mode !== "claim" ? returnToClaim : onClose}
        >
          {mode === "citation" ? (
            <CitationPicker
              onBack={returnToClaim}
              onAdd={(citation) => {
                if (
                  !value.material.citations.some(
                    (c) => canonicalJson(c) === canonicalJson(citation),
                  )
                )
                  form.setFieldValue("material.citations", [...value.material.citations, citation]);
                returnToClaim();
              }}
            />
          ) : mode === "context" ? (
            <ContextForm
              onDirty={() => setContextDirty(true)}
              onBusy={setContextBusy}
              onSaved={() => {
                setContextDirty(false);
                returnToClaim();
              }}
            />
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              {mergeSource && observed && (
                <div className="grid gap-5 border-y py-5 sm:grid-cols-2">
                  {[
                    { label: "Kept claim", detail: observed },
                    { label: "Claim to archive", detail: observedSource ?? mergeSource },
                  ].map((item) => (
                    <section key={item.label} className="min-w-0">
                      <p className="eyebrow">
                        {item.label} · Revision {item.detail.claim.revision}
                      </p>
                      <p className="mt-3 font-editorial text-xl leading-7">
                        {item.detail.claim.assertion}
                      </p>
                      <p className="mt-2 text-muted-foreground">{item.detail.claim.reviewState}</p>
                      {materialOf(item.detail).citations.map((citation) => (
                        <blockquote
                          key={`${citation.processingId}:${citation.start}:${citation.end}`}
                          className="mt-3 whitespace-pre-wrap border-l-2 pl-3"
                        >
                          {citation.quote}
                        </blockquote>
                      ))}
                      {item.detail.contexts
                        .filter((c) =>
                          materialOf(item.detail).contexts.some(
                            (ref) => ref.revisionId === c.revisionId,
                          ),
                        )
                        .map((c) => (
                          <p key={c.revisionId} className="mt-2 text-xs">
                            {c.data.label} · {c.data.role} · {c.data.organization}
                          </p>
                        ))}
                    </section>
                  ))}
                </div>
              )}
              {mergeSource && comparisonOrigin && (
                <p className="rounded-sm border p-3 text-sm">
                  This decision links the reviewed comparison in history. If its inputs changed, the
                  merge will fail without saving. Close this form to choose a manual decision
                  without that attribution.
                </p>
              )}
              <FormField label={mergeSource ? "Resulting assertion" : "Assertion"}>
                <Textarea
                  className="min-h-36"
                  maxLength={4000}
                  required
                  value={value.material.assertion}
                  onChange={(event) => form.setFieldValue("material.assertion", event.target.value)}
                  placeholder="Describe one fact you can support."
                />
              </FormField>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    Supporting citations · {value.material.citations.length}
                  </p>
                  <Button
                    ref={addCitation}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={value.material.citations.length >= 20}
                    onClick={() => setMode("citation")}
                  >
                    Add citation
                  </Button>
                </div>
                {value.material.citations.length === 0 && (
                  <p className="text-muted-foreground">
                    A Draft can be saved without citations. Verification requires a supporting
                    excerpt.
                  </p>
                )}
                {value.material.citations.map((citation, index) => (
                  <div
                    key={`${citation.processingId}:${citation.start}:${citation.end}`}
                    className="border-l-2 border-primary pl-4"
                  >
                    <blockquote className="whitespace-pre-wrap break-words font-editorial text-[21px] leading-7">
                      {citation.quote}
                    </blockquote>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Offsets {citation.start}–{citation.end}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove citation ${index + 1}`}
                        onClick={() =>
                          form.setFieldValue(
                            "material.citations",
                            value.material.citations.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 font-medium">Context revisions</legend>
                {contexts.data?.map((context) => {
                  const selected = value.material.contexts.find((ref) => ref.id === context.id);
                  const pinned = [
                    ...(observed?.contexts ?? []),
                    ...(mergeSource?.contexts ?? []),
                  ].filter(
                    (c, i, a) =>
                      c.id === context.id &&
                      c.revisionId !== context.revisionId &&
                      a.findIndex((other) => other.revisionId === c.revisionId) === i,
                  );
                  return (
                    <FormField key={context.id} label={context.data.label}>
                      <select
                        className={selectClass}
                        value={selected?.revisionId ?? ""}
                        onChange={(event) => {
                          const refs = value.material.contexts.filter(
                            (ref) => ref.id !== context.id,
                          );
                          form.setFieldValue(
                            "material.contexts",
                            event.target.value
                              ? [...refs, { id: context.id, revisionId: event.target.value }]
                              : refs,
                          );
                        }}
                      >
                        <option value="">Not linked</option>
                        {pinned.map((c) => (
                          <option key={c.revisionId} value={c.revisionId}>
                            {c.data.label} · pinned {c.revisionId.slice(-8)}
                          </option>
                        ))}
                        <option value={context.revisionId}>
                          Current · revision {context.revision} · {context.data.kind}
                        </option>
                      </select>
                    </FormField>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("context")}
                >
                  New context
                </Button>
              </fieldset>
              {observed && (
                <p className="border-l-2 border-primary bg-accent p-3 text-sm">
                  Saving material changes creates a new Draft revision. Previous assertions,
                  citations, and review decisions stay in history.
                </p>
              )}
              {mergeSource && (
                <>
                  <FormField label="Merge rationale">
                    <Textarea
                      required
                      maxLength={4000}
                      value={value.rationale}
                      onChange={(event) => form.setFieldValue("rationale", event.target.value)}
                    />
                  </FormField>
                  <p className="text-sm text-muted-foreground">
                    The source claim will be archived. Both claim identities, their sources, and
                    prior revisions remain. Existing checkpoints are unchanged.
                  </p>
                </>
              )}
              <Conflict
                error={save.error}
                id={observed?.claim.id ?? ""}
                local={
                  <>
                    <MaterialSummary
                      material={value.material}
                      contexts={[...(observed?.contexts ?? []), ...(contexts.data ?? [])]}
                    />
                    {value.rationale && (
                      <p className="mt-3 whitespace-pre-wrap">Merge rationale: {value.rationale}</p>
                    )}
                  </>
                }
                onReload={(latest) => {
                  setObserved(latest);
                  form.reset({ material: materialOf(latest), rationale: "" });
                  save.reset();
                }}
              />
              <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
                {observedSource && (
                  <Conflict
                    error={save.error}
                    id={observedSource.claim.id}
                    local={<p>{value.material.assertion}</p>}
                    reloadLabel="Use this source revision after review"
                    onReload={(latest) => {
                      setObservedSource(latest);
                      save.reset();
                    }}
                  />
                )}
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={save.isPending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  disabled={
                    save.isPending ||
                    !value.material.assertion.trim() ||
                    value.material.citations.length > 20 ||
                    value.material.contexts.length > 10 ||
                    (Boolean(mergeSource) && !value.rationale.trim()) ||
                    (Boolean(observed) &&
                      !mergeSource &&
                      canonicalJson(value.material) === canonicalJson(materialOf(observed)))
                  }
                >
                  {save.isPending
                    ? "Saving…"
                    : mergeSource
                      ? "Merge into kept claim"
                      : observed
                        ? "Save new revision"
                        : "Create claim"}
                </Button>
              </div>
            </form>
          )}
        </EvidenceDialog>
      )}
    </form.Subscribe>
  );
}
