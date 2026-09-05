import type { ReturnToStructuredRequest } from "@river/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { getResume, requestResumePreview } from "~/server/composition-functions";
import { createStructuredBranch, getStructuredReturn } from "~/server/refinement-functions";
import { SourceComparisonViews } from "./comparison";

type Detail = Extract<Awaited<ReturnType<typeof getStructuredReturn>>, { ok: true }>["value"];
export function StructuredReturn({
  checkpointId,
  onClose,
}: {
  checkpointId: string;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["source-refinements", "return", checkpointId],
    queryFn: async () => unwrap(await getStructuredReturn({ data: { id: checkpointId } })),
  });
  return (
    <EvidenceDialog
      wide
      className="sm:max-w-[1100px]"
      title="Return to structured editing"
      description="Review the changes that regeneration excludes before creating a new branch."
      onClose={onClose}
      pending={saving}
    >
      <Failure error={query.error} />
      {query.isPending && (
        <p role="status">
          Comparing the complete accepted source with its original structured base…
        </p>
      )}
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry comparison
        </Button>
      )}
      {query.data && <ReturnForm detail={query.data} onClose={onClose} onSaving={setSaving} />}
    </EvidenceDialog>
  );
}
function ReturnForm({
  detail,
  onClose,
  onSaving,
}: {
  detail: Detail;
  onClose: () => void;
  onSaving: (saving: boolean) => void;
}) {
  const confirmationId = useId();
  const [name, setName] = useState(
      `${detail.base.data.name.slice(0, 130)} · structured continuation`,
    ),
    [confirmed, setConfirmed] = useState(false),
    [compare, setCompare] = useState(false),
    [branchId, setBranchId] = useState<string | null>(null);
  const request = useRef<ReturnToStructuredRequest | null>(null),
    previewRequest = useRef<{ id: string; revision: number; idempotencyKey: string } | null>(null);
  const branch = useQuery({
    queryKey: ["resumes", "detail", branchId],
    enabled: !!branchId,
    queryFn: async () => unwrap(await getResume({ data: { id: branchId ?? "" } })),
    refetchInterval: (query) =>
      !query.state.data ||
      (query.state.data.request && ["Pending", "Running"].includes(query.state.data.request.state))
        ? 2000
        : false,
  });
  const preview = useMutation({
    mutationFn: async (id: string) => {
      previewRequest.current ??= { id, revision: 0, idempotencyKey: crypto.randomUUID() };
      return unwrap(await requestResumePreview({ data: previewRequest.current }));
    },
    onSuccess: () => {
      previewRequest.current = null;
      void branch.refetch();
    },
  });
  const create = useMutation({
    onMutate: () => onSaving(true),
    onSettled: () => onSaving(false),
    mutationFn: async () => {
      request.current ??= {
        idempotencyKey: crypto.randomUUID(),
        checkpointId: detail.checkpoint.id,
        structuredBaseId: detail.base.id,
        candidateDigest: detail.source.candidateDigest,
        name,
        regenerationConfirmed: confirmed,
      };
      return unwrap(await createStructuredBranch({ data: request.current }));
    },
    onSuccess: (result) => {
      setBranchId(result.id);
      preview.mutate(result.id);
    },
  });
  return (
    <div className="space-y-5">
      <p>
        Create a new branch from the original structured checkpoint. River regenerates LaTeX from
        its Content, Block, Section and template bindings.
      </p>
      <div className="space-y-2 border-l-2 border-highlight bg-highlight/10 p-4">
        <p className="font-semibold">Source-only edits will not carry into the new branch.</p>
        <p>
          {detail.comparison.changedFields} fields changed or moved relative to the original
          structured checkpoint. All source and extracted-text changes remain available in the
          comparison.
        </p>
      </div>
      <Button variant="outline" onClick={() => setCompare(!compare)} aria-expanded={compare}>
        Compare with structured base
      </Button>
      {compare && (
        <SourceComparisonViews
          source={detail.comparison.source}
          fields={detail.comparison.fields}
          extracted={detail.comparison.extracted}
          baseOperationId={detail.baseOperationId}
          candidateOperationId={detail.acceptedOperationId}
        />
      )}
      <p className="text-sm text-muted-foreground">
        The accepted source checkpoint, PDF, original checkpoint and newer working draft remain
        preserved. A retired template may need an eligible replacement before creating a new
        binding.
      </p>
      {branchId ? (
        <section className="space-y-4 border-t pt-5">
          <h2 className="text-2xl">Branch saved</h2>
          <p>{name}</p>
          <p className="font-mono text-xs break-all">{branchId}</p>
          <Failure error={preview.error} />
          <Failure error={branch.error} />
          <p role="status">
            {preview.isPending
              ? "Requesting branch preview…"
              : (branch.data?.request?.stage ??
                "The branch exists. Its preview is a separate document operation.")}
          </p>
          {branch.data?.request?.failure && (
            <p className="text-sm text-destructive">{branch.data.request.failure}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-3 font-semibold text-primary-foreground"
              to="/resumes/$resumeId"
              params={{ resumeId: branchId }}
            >
              Open new branch
            </Link>
            {(preview.error ||
              branch.data?.request?.state === "Failed" ||
              branch.data?.request?.state === "Cancelled") && (
              <Button
                variant="outline"
                disabled={preview.isPending}
                onClick={() => preview.mutate(branchId)}
              >
                Retry branch preview
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Retrying preview reuses this saved branch.
          </p>
        </section>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <FormField label="New branch name">
            <Input
              maxLength={160}
              required
              value={name}
              disabled={create.isPending || !!request.current}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <label htmlFor={confirmationId} className="flex items-start gap-3">
            <Checkbox
              id={confirmationId}
              className="mt-1"
              checked={confirmed}
              disabled={create.isPending || !!request.current}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <span>
              I understand that the new branch regenerates LaTeX and excludes these source-only
              edits.
            </span>
          </label>
          <Failure error={create.error} />
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>
              Keep source checkpoint
            </Button>
            <Button type="submit" disabled={!confirmed || !name.trim() || create.isPending}>
              {create.isPending
                ? "Saving branch…"
                : create.error
                  ? "Retry exact branch request"
                  : "Create branch & regenerate"}
            </Button>
            {create.error && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  request.current = null;
                  create.reset();
                }}
              >
                Review branch request
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
