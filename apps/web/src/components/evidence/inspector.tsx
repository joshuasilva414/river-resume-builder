import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Clarifications } from "./clarifications";
import { DuplicateHistory } from "./duplicate-ai";
import type { EvidenceDetail } from "./shared";

export function EvidenceInspector({
  detail,
  onAction,
  initialRevisionId = null,
}: {
  detail: EvidenceDetail;
  initialRevisionId?: string | null;
  onAction?: (action: "edit" | "review" | "metadata" | "archive") => void;
}) {
  const [revisionId, setRevision] = useState<string | null>(initialRevisionId);
  const [tab, setTab] = useState("citations");
  const revision = detail.revisions.find(
    (r) => r.id === (revisionId ?? detail.claim.currentRevisionId),
  );
  const historical = revision?.id !== detail.claim.currentRevisionId;
  const decisions = detail.decisions.filter((d) => d.revisionId === revision?.id);
  const reviewState = historical ? (decisions[0]?.state ?? "Draft") : detail.claim.reviewState;
  return (
    <div className="space-y-5 pb-24 xl:pb-0">
      <div>
        <p className="eyebrow">
          {historical
            ? "Historical evidence revision"
            : `Claim / Revision ${detail.claim.revision}`}
        </p>
        <p className="mt-3 font-sans text-xl font-medium leading-7 whitespace-pre-wrap break-words xl:font-editorial xl:text-[22px] xl:font-normal xl:leading-[31px]">
          {revision?.material.assertion}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={reviewState === "Verified" ? "text-approved" : ""}>
          {reviewState}
        </Badge>
        {detail.claim.archivedAt && <Badge variant="outline">Archived</Badge>}
      </div>
      {historical ? (
        <Button variant="outline" onClick={() => setRevision(null)}>
          Return to current revision
        </Button>
      ) : onAction ? (
        <div className="hidden flex-wrap gap-2 xl:flex">
          {!detail.claim.archivedAt && (
            <>
              <Button size="sm" onClick={() => onAction?.("review")}>
                Review claim
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction?.("edit")}>
                Edit claim
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => onAction?.("archive")}>
            {detail.claim.archivedAt ? "Restore claim" : "Archive"}
          </Button>
        </div>
      ) : null}
      {decisions[0] && (
        <div className="border-l-2 border-approved pl-4">
          <p className="text-xs text-muted-foreground">
            Latest decision · {new Date(decisions[0].createdAt).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{decisions[0].rationale}</p>
        </div>
      )}
      {revision?.material.contexts.map((reference) => {
        const context = detail.contexts.find((c) => c.revisionId === reference.revisionId);
        return context ? (
          <details key={reference.revisionId} className="border-y py-3">
            <summary className="cursor-pointer text-sm">
              {context.data.kind} · {context.data.label}
            </summary>
            <dl className="mt-3 space-y-2 text-sm">
              <dt className="text-muted-foreground">Pinned context snapshot</dt>
              <dd>
                {[
                  context.data.organization,
                  context.data.role,
                  context.data.startDate,
                  context.data.endDate,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
              <dd className="whitespace-pre-wrap">{context.data.details}</dd>
              {context.data.contact && (
                <dd className="whitespace-pre-wrap">
                  {[
                    context.data.contact.email,
                    context.data.contact.phone,
                    context.data.contact.location,
                    ...context.data.contact.links,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </dd>
              )}
              <dd className="break-all font-mono text-xs">{reference.revisionId}</dd>
            </dl>
          </details>
        ) : null;
      })}
      <Clarifications
        detail={detail}
        canEdit={!historical && !detail.claim.archivedAt && Boolean(onAction)}
        onEdit={onAction ? () => onAction("edit") : undefined}
        onInspectRevision={(id) => {
          setRevision(id);
          setTab("citations");
        }}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="citations">Citations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="citations" className="space-y-6 pt-5">
          {!revision?.material.citations.length && (
            <p className="text-muted-foreground">
              No supporting excerpts yet. Edit this claim to add a citation.
            </p>
          )}
          {revision?.material.citations.map((citation) => (
            <article
              key={`${citation.processingId}:${citation.start}:${citation.end}`}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {detail.sources.find((s) => s.id === citation.sourceId)?.title ??
                    "Original source"}
                </p>
                {citation.attestation && <Badge variant="outline">Owner attestation</Badge>}
              </div>
              <blockquote className="border-l-[3px] border-primary pl-4 font-editorial text-[21px] leading-7 whitespace-pre-wrap break-words">
                {citation.quote}
              </blockquote>
              <p className="text-xs text-muted-foreground">
                {[
                  ...new Set(
                    citation.locators.map((l) =>
                      l.page ? `Page ${l.page}` : l.line ? `Line ${l.line}` : "",
                    ),
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ") || "Exact text offsets"}
              </p>
              <details>
                <summary className="cursor-pointer text-xs text-primary">
                  Citation provenance
                </summary>
                <dl className="mt-3 grid gap-2 text-xs">
                  <dt>Source</dt>
                  <dd className="break-all font-mono">{citation.sourceId}</dd>
                  <dt>Processing result</dt>
                  <dd className="break-all font-mono">{citation.processingId}</dd>
                  <dt>UTF-16 offsets (start inclusive, end exclusive)</dt>
                  <dd className="font-mono">
                    {citation.start}–{citation.end}
                  </dd>
                </dl>
                <a
                  className="mt-3 inline-block text-primary underline"
                  href={`/api/v1/sources/${citation.sourceId}?download`}
                >
                  Download original
                </a>
              </details>
            </article>
          ))}
        </TabsContent>
        <TabsContent value="history" className="space-y-5 pt-5">
          <p className="text-sm text-muted-foreground">
            Material revisions retain their original citations and context. Decisions and lifecycle
            changes are recorded separately.
          </p>
          {detail.revisions.map((item, i) => (
            <article key={item.id} className="space-y-2 border-t pt-4">
              <p className="font-medium">
                Evidence version {detail.revisions.length - i}
                {item.id === detail.claim.currentRevisionId ? " · Current" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{item.material.assertion}</p>
              <details className="text-xs">
                <summary className="cursor-pointer">Revision and actor</summary>
                <p className="break-all font-mono">{item.id}</p>
                <p className="break-all font-mono">Actor {item.actorId}</p>
              </details>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRevision(item.id);
                  setTab("citations");
                }}
              >
                Inspect this revision
              </Button>
              {detail.decisions
                .filter((d) => d.revisionId === item.id)
                .map((d) => (
                  <p key={d.id} className="text-sm">
                    {d.state} · {d.rationale}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({new Date(d.createdAt).toLocaleString()})
                    </span>
                  </p>
                ))}
            </article>
          ))}
          <DuplicateHistory claimId={detail.claim.id} />
          <p className="eyebrow pt-4">Activity</p>
          {detail.activity.map((entry) => (
            <details key={entry.id} className="border-t py-3">
              <summary className="cursor-pointer text-sm">
                {entry.command.replaceAll("-", " ")} · {new Date(entry.createdAt).toLocaleString()}
              </summary>
              <p className="my-2 break-all font-mono text-xs">Actor {entry.actorId}</p>
              <div className="grid gap-3">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                  Before: {entry.before ?? "None"}
                </pre>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                  After: {entry.after}
                </pre>
              </div>
            </details>
          ))}
        </TabsContent>
        <TabsContent value="metadata" className="space-y-4 pt-5">
          <p className="text-muted-foreground">
            Current metadata belongs to the claim. Earlier values remain in activity history.
          </p>
          <dl className="space-y-2">
            <dt className="font-medium">Label</dt>
            <dd>{detail.claim.metadata.label || "No label"}</dd>
            <dt className="font-medium">Tags</dt>
            <dd>{detail.claim.metadata.tags.join(", ") || "No tags"}</dd>
            <dt className="font-medium">Private notes</dt>
            <dd className="whitespace-pre-wrap">{detail.claim.metadata.notes || "No notes"}</dd>
          </dl>
          {!historical && onAction && (
            <Button variant="outline" onClick={() => onAction?.("metadata")}>
              Edit metadata
            </Button>
          )}
        </TabsContent>
      </Tabs>
      <details className="border-t pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Claim identity</summary>
        <p className="mt-2 break-all font-mono">{detail.claim.id}</p>
        <p className="mt-2 break-all font-mono">Evidence revision {revision?.id}</p>
      </details>
      {!historical && onAction && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap gap-3 border-t bg-card px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] md:left-[204px] xl:hidden">
          {detail.claim.archivedAt ? (
            <Button className="h-11 flex-1" onClick={() => onAction?.("archive")}>
              Restore claim
            </Button>
          ) : (
            <>
              <Button className="h-11 flex-1" variant="outline" onClick={() => onAction?.("edit")}>
                Edit claim
              </Button>
              <Button className="h-11 flex-1" onClick={() => onAction?.("review")}>
                Review decision
              </Button>
              <Button className="h-11" variant="ghost" onClick={() => onAction?.("archive")}>
                Archive
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
