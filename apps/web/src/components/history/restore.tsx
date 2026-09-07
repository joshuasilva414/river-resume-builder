import type { RestoreCheckpointRequest } from "@river/contracts";
import { canonicalJson } from "@river/domain";
import { fixedPack, type TemplateBase, validateGraph } from "@river/templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { CompositionView } from "~/components/composition/view";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { StructuredReturn } from "~/components/refinement/structured-return";
import { compositionBase } from "~/components/templates/binding";
import { BasePicker, GraphView, useTemplateBase } from "~/components/templates/shared";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { createCheckpointBranch, getCheckpointBranchSource } from "~/server/checkpoint-functions";

type Detail = Extract<Awaited<ReturnType<typeof getCheckpointBranchSource>>, { ok: true }>["value"];
export function RestoreCheckpoint({
  checkpointId,
  onClose,
}: {
  checkpointId: string;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [regenerate, setRegenerate] = useState(false);
  const query = useQuery({
    queryKey: ["checkpoint-branch-source", checkpointId],
    queryFn: async () => unwrap(await getCheckpointBranchSource({ data: { id: checkpointId } })),
  });
  return (
    <EvidenceDialog
      title="Restore as a new branch"
      description={`Checkpoint ${checkpointId.slice(-8)}. The saved checkpoint and newer work remain available.`}
      onClose={onClose}
      pending={pending}
      wide
    >
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading the saved composition and template…</p>}
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry checkpoint inspection
        </Button>
      )}
      {query.data?.requiresRegeneration ? (
        <div className="space-y-4">
          <p>
            This checkpoint has accepted source changes. Structured editing starts from its original
            original editable content and rebuilds the document. Review all excluded changes before
            creating that branch.
          </p>
          <Button onClick={() => setRegenerate(true)}>Review excluded changes</Button>
        </div>
      ) : (
        query.data && (
          <RestoreForm key={query.data.checkpoint.id} detail={query.data} onPending={setPending} />
        )
      )}
      {regenerate && (
        <StructuredReturn checkpointId={checkpointId} onClose={() => setRegenerate(false)} />
      )}
    </EvidenceDialog>
  );
}
function RestoreForm({
  detail,
  onPending,
}: {
  detail: Detail;
  onPending: (value: boolean) => void;
}) {
  const original = compositionBase(detail.checkpoint.data),
    client = useQueryClient(),
    confirmationId = useId();
  const [name, setName] = useState(`${detail.checkpoint.data.name.slice(0, 140)} · restored`);
  const [selection, setSelection] = useState<TemplateBase>(original),
    [confirmed, setConfirmed] = useState(false),
    [branchId, setBranchId] = useState<string | null>(null);
  const selected = useTemplateBase(selection),
    request = useRef<RestoreCheckpointRequest | null>(null);
  const changed = canonicalJson(selection) !== canonicalJson(original);
  const eligible = changed
    ? selection.kind === "fixed" || selected.data?.revision.state === "Approved"
    : !detail.templateIssue;
  const create = useMutation({
    onMutate: () => onPending(true),
    onSettled: () => onPending(false),
    mutationFn: async () => {
      if (!selected.graph) throw new Error("The selected template is unavailable.");
      request.current ??= {
        checkpointId: detail.checkpoint.id,
        name,
        idempotencyKey: crypto.randomUUID(),
        ...(changed
          ? {
              replacement: {
                theme: selected.graph.theme,
                confirmed,
                template:
                  selection.kind === "saved" && selected.data
                    ? { designId: selected.data.design.id, revisionId: selection.revisionId }
                    : null,
              },
            }
          : {}),
      };
      return unwrap(await createCheckpointBranch({ data: request.current }));
    },
    onSuccess: (result) => {
      setBranchId(result.id);
      void client.invalidateQueries({ queryKey: ["resumes"] });
    },
  });
  const frozen = !!request.current || create.isPending || !!branchId;
  return (
    <div className="space-y-5">
      <p className="eyebrow">
        {detail.checkpoint.label ?? "Saved checkpoint"} · Captured draft r
        {detail.checkpoint.draftRevision} · {new Date(detail.checkpoint.createdAt).toLocaleString()}
      </p>
      <p className="text-sm">
        Create a named draft from this exact composition, local wording and pinned references.
        Review the saved contact, context and evidence before preparing a new export.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Inspect the complete saved composition
        </summary>
        <div className="mt-4">
          <CompositionView
            data={detail.checkpoint.data}
            graph={detail.checkpoint.graph}
            provenance
          />
        </div>
      </details>
      <FormField label="New draft name">
        <Input
          maxLength={160}
          value={name}
          disabled={frozen}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      {detail.templateIssue && (
        <p className="border-l-2 border-warning bg-warning/10 p-4 text-sm">
          {detail.templateIssue}
        </p>
      )}
      <BasePicker
        value={selection}
        onChange={(value) => {
          setSelection(value);
          setConfirmed(false);
        }}
        approvedOnly
        disabled={frozen}
        label="Template for the new branch"
      />
      <Failure error={selected.error} />
      {changed && (
        <div className="space-y-4">
          <h3 className="font-editorial text-xl">Review the template change</h3>
          {selected.graph && (
            <GraphView
              graph={selected.graph}
              original={
                detail.checkpoint.templateGraph ??
                validateGraph(fixedPack(detail.checkpoint.data.theme))
              }
            />
          )}
          <label htmlFor={confirmationId} className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              id={confirmationId}
              checked={confirmed}
              disabled={frozen}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            I reviewed the template change for this new branch.
          </label>
        </div>
      )}
      <Failure error={create.error} />
      {branchId ? (
        <div className="space-y-3 rounded-md border bg-primary/5 p-4">
          <p role="status">Branch created. Its history starts from this checkpoint.</p>
          <Link
            className="inline-flex min-h-11 items-center text-sm text-primary underline"
            target="_blank"
            rel="noreferrer"
            to="/resumes/$resumeId"
            params={{ resumeId: branchId }}
          >
            Open new branch in a new tab
          </Link>
          <p className="text-xs text-muted-foreground">
            Keep the current editor open until its pending changes are saved.
          </p>
        </div>
      ) : (
        <Button
          disabled={
            create.isPending ||
            !name.trim() ||
            !eligible ||
            !selected.graph ||
            (changed && !confirmed)
          }
          onClick={() => create.mutate()}
        >
          {create.isPending
            ? "Creating branch…"
            : create.error
              ? "Retry branch creation"
              : "Create branch"}
        </Button>
      )}
    </div>
  );
}
