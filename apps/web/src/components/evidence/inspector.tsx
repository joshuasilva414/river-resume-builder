import { useState } from "react";
import { TrashAction } from "~/components/trash/actions";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { EvidenceDetail } from "./shared";

export function EvidenceInspector({
  detail,
  onAction,
  onTrash,
  initialRevisionId = null,
}: {
  detail: EvidenceDetail;
  initialRevisionId?: string | null;
  onTrash?: () => void;
  onAction?: (action: "edit" | "review" | "metadata" | "archive") => void;
}) {
  const [selected, setSelected] = useState(initialRevisionId);
  const revision = detail.revisions.find(
    (item) => item.id === (selected ?? detail.claim.currentRevisionId),
  );
  const historical = revision?.id !== detail.claim.currentRevisionId;
  const sources = new Set([
    ...(revision?.material.sourceIds ?? []),
    ...(revision?.material.citations.map((item) => item.sourceId) ?? []),
  ]);
  return (
    <section className="space-y-5" aria-label="Evidence details">
      <div className="flex gap-2">
        <Badge variant="outline">{detail.claim.metadata.type ?? "Other"}</Badge>
        {detail.claim.archivedAt && <Badge variant="outline">In Trash</Badge>}
      </div>
      <p className="whitespace-pre-wrap break-words text-xl leading-8">
        {revision?.material.assertion}
      </p>
      {detail.claim.metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {detail.claim.metadata.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <div>
        <h3 className="font-sans text-sm font-semibold">Sources</h3>
        {!sources.size && <p className="mt-2 text-sm text-muted-foreground">No sources linked.</p>}
        {detail.sources
          .filter((source) => sources.has(source.id))
          .map((source) => (
            <p className="mt-2 text-sm" key={source.id}>
              <a href={`/api/v1/sources/${source.id}?download`} className="text-primary underline">
                {source.title}
              </a>
            </p>
          ))}
      </div>
      {historical && (
        <Button variant="outline" onClick={() => setSelected(null)}>
          View current evidence
        </Button>
      )}
      {!historical && onAction && (
        <div className="flex gap-3">
          {!detail.claim.archivedAt && (
            <Button variant="outline" onClick={() => onAction("edit")}>
              Edit evidence
            </Button>
          )}
          <TrashAction
            item={{
              id: detail.claim.id,
              kind: "evidence",
              label: revision?.material.assertion.slice(0, 80) ?? "Evidence",
              revision: detail.claim.revision,
              archivedAt: detail.claim.archivedAt,
            }}
            onChanged={onTrash}
          />
        </div>
      )}
      {detail.revisions.length > 1 && (
        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm">Saved versions</summary>
          <div className="mt-3 flex flex-col items-start gap-2">
            {detail.revisions.map((item) => (
              <Button key={item.id} variant="link" onClick={() => setSelected(item.id)}>
                {new Date(item.createdAt).toLocaleString()}
                {item.id === detail.claim.currentRevisionId ? " · Current" : ""}
              </Button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
