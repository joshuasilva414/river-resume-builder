import { type Composition, canonicalJson } from "@river/domain";
import type { TemplateBase } from "@river/templates";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import type { JobDetail } from "~/components/jobs/shared";
import { BindingInspection } from "~/components/templates/binding";
import { BasePicker, useTemplateBase } from "~/components/templates/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { addResume, getResumes } from "~/server/composition-functions";
export function JobResumes({ detail, readOnly }: { detail: JobDetail; readOnly: boolean }) {
  const [creating, setCreating] = useState(false),
    [offset, setOffset] = useState(0);
  const result = useQuery({
    queryKey: ["resumes", "job", detail.job.id, offset],
    queryFn: async () => unwrap(await getResumes({ data: { jobId: detail.job.id, offset } })),
    placeholderData: (previous) => previous,
  });
  return (
    <section className="space-y-6 border-b p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="font-editorial text-2xl">Résumé drafts</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Continue a saved draft, or start one for this posting.
          </p>
        </div>
        {!readOnly && <Button onClick={() => setCreating(true)}>Create résumé draft</Button>}
      </div>
      <Failure error={result.error} />
      {result.error && (
        <Button variant="outline" onClick={() => void result.refetch()}>
          Retry drafts
        </Button>
      )}
      {result.isPending && <p role="status">Loading saved drafts…</p>}
      {result.data?.items.map((item) => (
        <article
          key={item.id}
          className="grid items-center gap-4 border-t py-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div>
            <h3 className="font-sans font-semibold">{item.data.name}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved {new Date(item.updatedAt).toLocaleString()}
            </p>
          </div>
          <p className="text-sm">
            {item.snapshotId === detail.snapshot.id
              ? "This posting"
              : item.snapshotCreatedAt < detail.snapshot.createdAt
                ? "Earlier posting"
                : "Other posting"}
            <span className="eyebrow mt-2 block">Snapshot {item.snapshotId.slice(-8)}</span>
          </p>
          <p className="text-sm capitalize">
            {item.data.template ? "Custom template" : item.data.theme}
            <span className="eyebrow mt-2 block">Draft revision {item.revision}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {item.branchOf
              ? item.branchName
                ? `Branch of ${item.branchName}`
                : `Branch · ${item.branchOf.slice(-8)}`
              : "Original draft"}
          </p>
          <Button variant="outline" asChild>
            <Link to="/resumes/$resumeId" params={{ resumeId: item.id }}>
              Open draft
            </Link>
          </Button>
        </article>
      ))}
      {result.data && !result.data.items.length && (
        <p className="text-sm text-muted-foreground">
          Start from reusable Sections. Selected evidence stays available to consult.
        </p>
      )}
      {result.data && (offset > 0 || result.data.hasMore) && (
        <div className="flex items-center justify-end gap-4">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </Button>
          <span className="text-sm">Page {offset / 50 + 1}</span>
          <Button
            variant="outline"
            disabled={!result.data.hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </Button>
        </div>
      )}
      {creating && <NewDraft detail={detail} onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewDraft({ detail, onClose }: { detail: JobDetail; onClose: () => void }) {
  const [observed] = useState(detail),
    navigate = useNavigate(),
    client = useQueryClient();
  const [base, setBase] = useState<TemplateBase>({ kind: "fixed", theme: "classic" });
  const selected = useTemplateBase(base);
  const eligible = base.kind === "fixed" || selected.data?.revision.state === "Approved";
  const retry = useRef<{ payload: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: async (value: Composition) => {
      const payload = canonicalJson(value);
      if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await addResume({
          data: {
            idempotencyKey: retry.current.key,
            jobId: observed.job.id,
            jobRevision: observed.job.revision,
            snapshotId: observed.snapshot.id,
            data: value,
          },
        }),
      );
    },
    onSuccess: async (outcome) => {
      await client.invalidateQueries({ queryKey: ["resumes"] });
      onClose();
      void navigate({ to: "/resumes/$resumeId", params: { resumeId: outcome.id } });
    },
  });
  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      if (!selected.graph || !eligible) return;
      await mutation
        .mutateAsync({
          ...value,
          theme: selected.graph.theme,
          templateRevision: 1,
          sections: [],
          ...(base.kind === "saved" && selected.data
            ? { template: { designId: selected.data.design.id, revisionId: base.revisionId } }
            : {}),
        })
        .catch(() => {});
    },
  });
  return (
    <form.Subscribe selector={(state) => state.isDirty}>
      {(dirty) => (
        <EvidenceDialog
          title="Create résumé draft"
          description="Start a résumé for this job using the saved posting. Choose a template, then add your content."
          onClose={onClose}
          dirty={dirty || base.kind === "saved" || base.theme !== "classic"}
          pending={mutation.isPending}
          className="sm:max-w-[608px]"
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="name">
              {(field) => (
                <FormField label="Draft name">
                  <Input
                    required
                    maxLength={160}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FormField>
              )}
            </form.Field>
            <p className="text-sm">
              {observed.snapshot.details.role} · {observed.snapshot.details.company}
            </p>
            <p className="eyebrow break-all">Posting snapshot {observed.snapshot.id}</p>
            <BasePicker
              label="Template graph"
              value={base}
              onChange={setBase}
              approvedOnly
              disabled={mutation.isPending}
            />
            <BindingInspection base={base} />
            <p className="text-sm text-muted-foreground">
              Your draft will use this template revision, even if the template changes later.
            </p>
            {!eligible && selected.data && (
              <p role="status" className="text-sm text-destructive">
                The selected graph is no longer Approved. Choose an eligible revision before
                creating this draft.
              </p>
            )}
            <Failure error={mutation.error} />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button disabled={mutation.isPending || !selected.graph || !eligible}>
                {mutation.isPending ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </form>
        </EvidenceDialog>
      )}
    </form.Subscribe>
  );
}
