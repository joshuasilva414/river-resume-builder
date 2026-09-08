import { renderComposition } from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { Button } from "~/components/ui/button";
import { requestResumePreview } from "~/server/composition-functions";
import { cancelDocumentOperation } from "~/server/functions";
import type { ResumeDetail } from "./use-draft";
export function DraftPreview({
  detail,
  revision,
  dirty,
}: {
  detail: ResumeDetail;
  revision: number;
  dirty: boolean;
}) {
  const client = useQueryClient(),
    cancelled = useRef(0),
    attempted = useRef<number | null>(null),
    identity = useRef<{ revision: number; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: async (retry: boolean) => {
      const generation = cancelled.current;
      if (identity.current?.revision !== revision || retry)
        identity.current = { revision, key: crypto.randomUUID() };
      const result = unwrap(
        await requestResumePreview({
          data: { id: detail.draft.id, revision, idempotencyKey: identity.current.key },
        }),
      );
      if (generation !== cancelled.current)
        unwrap(
          await cancelDocumentOperation({
            data: { operationId: result.id, idempotencyKey: crypto.randomUUID() },
          }),
        );
      return result;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["resumes", "detail", detail.draft.id] }),
  });
  const cancellation = useMutation({
    mutationFn: async () => {
      cancelled.current++;
      if (detail.request && ["Pending", "Running"].includes(detail.request.state))
        unwrap(
          await cancelDocumentOperation({
            data: { operationId: detail.request.id, idempotencyKey: crypto.randomUUID() },
          }),
        );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["resumes", "detail", detail.draft.id] }),
  });
  let readiness: string | null = null;
  try {
    renderComposition(detail.draft.data, detail.graph);
  } catch (error) {
    readiness = error instanceof Error ? error.message : "Complete the draft before previewing.";
  }
  const active = detail.request && ["Pending", "Running"].includes(detail.request.state);
  const expectedTemplates = detail.templateIdentity;
  const requestRevision =
    detail.request &&
    "document" in detail.request.input &&
    detail.request.input.templateIdentity === expectedTemplates
      ? detail.request.input.preview?.revision
      : null;
  useEffect(() => {
    if (
      dirty ||
      readiness ||
      active ||
      mutation.isPending ||
      detail.draft.revision !== revision ||
      attempted.current === revision ||
      requestRevision === revision
    )
      return;
    attempted.current = revision;
    mutation.mutate(false);
  }, [
    dirty,
    readiness,
    active,
    mutation.isPending,
    detail.draft.revision,
    revision,
    requestRevision,
    mutation.mutate,
  ]);
  const expired =
    !!detail.preview &&
    (detail.preview.artifacts?.expiresAt ?? detail.preview.createdAt + 7 * 24 * 60 * 60 * 1000) <=
      Date.now();
  const earlierTemplates = detail.preview?.artifacts?.templateIdentity !== expectedTemplates;
  const current =
    detail.draft.lastPreviewRevision === revision && !dirty && !expired && !earlierTemplates;
  return (
    <aside className="min-w-0 bg-muted/60 xl:overflow-y-auto">
      <header className="flex flex-wrap items-center gap-3 border-b bg-background px-6 py-5">
        <h2 className="font-sans text-sm font-semibold">PDF preview</h2>
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          {(active || mutation.isPending) && <LoaderCircle className="size-4 animate-spin" />}
          {active || mutation.isPending
            ? "Updating"
            : expired
              ? "Preview expired"
              : current
                ? "Current"
                : detail.preview
                  ? earlierTemplates
                    ? "Earlier template rendering"
                    : "Showing the last successful preview"
                  : "No preview yet"}
        </p>
        {(active || mutation.isPending) && (
          <Button
            type="button"
            variant="ghost"
            disabled={cancellation.isPending}
            onClick={() => cancellation.mutate()}
          >
            Cancel
          </Button>
        )}
      </header>
      <div className="space-y-5 p-6">
        {detail.preview?.artifacts && !expired && (
          <PdfPreview url={`/api/artifacts/${detail.preview.id}/pdf`} />
        )}
        {expired && (
          <div className="space-y-3">
            <p className="text-sm">
              Previews expire after seven days. Files from saved versions stay available.
            </p>
            <Button
              variant="outline"
              disabled={dirty || active || mutation.isPending || !!readiness}
              onClick={() => mutation.mutate(true)}
            >
              Request fresh preview
            </Button>
          </div>
        )}
        <Failure error={mutation.error ?? cancellation.error} />
        {readiness && <p className="text-sm">{readiness}</p>}
        {detail.request?.failure && (
          <p className="border-l-2 border-warning p-4 text-sm">
            {detail.request.failure} Your résumé and last successful PDF are preserved.
          </p>
        )}
        {!readiness &&
          !active &&
          !mutation.isPending &&
          (mutation.error ||
            detail.request?.state === "Failed" ||
            detail.request?.state === "Cancelled") && (
            <Button
              variant="outline"
              disabled={dirty}
              onClick={() =>
                mutation.mutate(
                  detail.request?.state === "Failed" || detail.request?.state === "Cancelled",
                )
              }
            >
              Retry preview
            </Button>
          )}
        {dirty && (
          <p className="text-xs text-muted-foreground">
            The preview updates after your changes save.
          </p>
        )}
        {detail.preview?.artifacts && !expired && (
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="text-primary underline"
              target="_blank"
              rel="noreferrer"
              href={`/api/artifacts/${detail.preview.id}/text`}
            >
              Extracted text
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
