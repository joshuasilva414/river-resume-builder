import { blockDefinitions, type ContentType, contentTypes, type LibraryKind } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Failure, FormField, selectClass, unwrap } from "~/components/evidence/shared";
import { LibraryEditor } from "~/components/library/editor";
import { EvidenceLinks } from "~/components/library/evidence-links";
import {
  kindLabels,
  LibraryDataView,
  type LibraryDetail,
  useLibraryDetail,
} from "~/components/library/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { cn } from "~/lib/utils";
import { getSession } from "~/server/functions";
import { getLibrary } from "~/server/library-functions";
export const Route = createFileRoute("/library")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: LibraryPage,
});
function LibraryPage() {
  const session = Route.useRouteContext();
  const [kind, setKind] = useState<LibraryKind>("content");
  const [type, setType] = useState<ContentType | null>(null);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{ id: string; revisionId?: string } | null>(null);
  const [editor, setEditor] = useState<{ kind: LibraryKind; detail?: LibraryDetail } | null>(null);
  const input = { kind, type, query, offset };
  const list = useQuery({
    queryKey: ["library", "search", input],
    queryFn: async () => unwrap(await getLibrary({ data: input })),
    placeholderData: (previous) => previous,
  });
  const detail = useLibraryDetail(selected);
  return (
    <WorkspaceShell {...session} mobileFocus={Boolean(selected)}>
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-5 border-b px-5 py-7 md:px-8",
          selected && "hidden xl:flex",
        )}
      >
        <div>
          <h1 className="page-heading">Content library</h1>
          <p className="mt-2 text-muted-foreground">
            Save wording, blocks, and sections to reuse across résumés. Keep supporting evidence
            linked to your content.
          </p>
        </div>
        <Button onClick={() => setEditor({ kind })}>
          <Plus />
          New {kindLabels[kind].toLowerCase()}
        </Button>
      </header>
      <div className="grid flex-1 xl:grid-cols-[minmax(400px,1fr)_minmax(0,1fr)]">
        <section
          className={cn("space-y-5 border-r px-5 py-6 md:px-8", selected && "hidden xl:block")}
        >
          <Tabs
            value={kind}
            onValueChange={(value) => {
              if (value === "content" || value === "block" || value === "section") {
                setKind(value);
                setOffset(0);
                setSelected(null);
              }
            }}
          >
            <TabsList variant="line">
              <TabsTrigger value="content">Content items</TabsTrigger>
              <TabsTrigger value="block">Blocks</TabsTrigger>
              <TabsTrigger value="section">Sections</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Search library">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </FormField>
            <FormField label="Content type">
              <select
                className={selectClass}
                value={type ?? "all"}
                onChange={(event) => {
                  setType(contentTypes.find((value) => value === event.target.value) ?? null);
                  setOffset(0);
                }}
              >
                <option value="all">All types</option>
                {contentTypes.map((type) => (
                  <option key={type} value={type}>
                    {blockDefinitions[type].label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <Failure error={list.error} />
          {list.error && (
            <Button variant="outline" onClick={() => void list.refetch()}>
              Retry library search
            </Button>
          )}
          {list.isPending && <p role="status">Loading library…</p>}
          {list.data?.items.map((entry) => (
            <button
              type="button"
              key={entry.item.id}
              onClick={() => setSelected({ id: entry.item.id })}
              className={cn(
                "block w-full space-y-3 border-b border-l-2 border-l-transparent p-5 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                selected?.id === entry.item.id && "border-l-primary bg-accent",
              )}
            >
              <p className="font-semibold">{entry.item.label}</p>
              {entry.revision.data.kind === "content" && (
                <p className="line-clamp-3 whitespace-pre-wrap text-[15px] leading-6">
                  {entry.revision.data.wording}
                </p>
              )}
              <p className="eyebrow">
                {blockDefinitions[entry.item.type].label} · Revision {entry.item.revision}
                {entry.revision.data.kind === "content" &&
                  ` · ${entry.revision.data.evidence.length} evidence links`}
              </p>
            </button>
          ))}
          {list.data && !list.data.items.length && (
            <div className="space-y-3 py-10">
              <h2 className="font-editorial text-2xl">
                {query
                  ? "No matching library items"
                  : `Create your first ${kindLabels[kind].toLowerCase()}.`}
              </h2>
              <p className="text-sm text-muted-foreground">
                Start with a wording unit. Blocks bind items into fields; Sections arrange Blocks.
              </p>
              <Button onClick={() => setEditor({ kind })}>
                New {kindLabels[kind].toLowerCase()}
              </Button>
            </div>
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
        </section>
        <aside
          className={cn("min-w-0 space-y-5 px-5 py-6 md:px-8", !selected && "hidden xl:block")}
        >
          {selected && (
            <Button className="xl:hidden" variant="link" onClick={() => setSelected(null)}>
              <ArrowLeft />
              Back to library
            </Button>
          )}
          <Failure error={detail.error} />
          {detail.isFetching && !detail.data && selected && <p>Loading library revision…</p>}
          {!selected && (
            <p className="py-20 text-center text-muted-foreground">
              Choose an item to inspect its wording and evidence.
            </p>
          )}
          {detail.data && (
            <>
              <div className="space-y-3">
                <Badge variant="outline">
                  {blockDefinitions[detail.data.item.type].label} ·{" "}
                  {kindLabels[detail.data.item.kind]}
                </Badge>
                <h2 className="font-editorial text-[28px] leading-[34px]">
                  {detail.data.revision.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {new Date(detail.data.revision.createdAt).toLocaleString()}
                  {detail.data.revision.id !== detail.data.item.currentRevisionId
                    ? " · Historical revision"
                    : " · Current library revision"}
                </p>
                {detail.data.revision.id === detail.data.item.currentRevisionId ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (detail.data)
                        setEditor({ kind: detail.data.item.kind, detail: detail.data });
                    }}
                  >
                    Edit reusable {kindLabels[detail.data.item.kind].toLowerCase()}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setSelected({ id: detail.data.item.id })}
                  >
                    Return to current revision
                  </Button>
                )}
              </div>
              <LibraryDataView data={detail.data.revision.data} graph={detail.data.graph} />
              <EvidenceLinks
                value={detail.data.evidence.map((ref) => ({
                  claimId: ref.claimId,
                  revisionId: ref.revisionId,
                }))}
              />
              <details className="border-t pt-5">
                <summary className="cursor-pointer text-sm font-semibold">Revision history</summary>
                <div className="mt-4 space-y-4">
                  {detail.data.history.map((revision) => (
                    <article key={revision.id} className="space-y-2 border-b pb-4">
                      <p className="text-sm font-medium">{revision.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(revision.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">
                        {revision.rationale || "No revision note"}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelected({ id: detail.data.item.id, revisionId: revision.id })
                        }
                      >
                        Inspect this revision
                      </Button>
                    </article>
                  ))}
                </div>
              </details>
              <details className="border-t pt-4 text-xs">
                <summary className="cursor-pointer">Revision identity</summary>
                <p className="mt-3 break-all font-mono">{detail.data.revision.id}</p>
                <p className="mt-2 break-all font-mono">Actor {detail.data.revision.actorId}</p>
              </details>
            </>
          )}
        </aside>
      </div>
      {editor && (
        <LibraryEditor
          kind={editor.kind}
          initialType={type ?? "summary"}
          detail={editor.detail}
          onClose={() => setEditor(null)}
          onSaved={(ref) => setSelected({ id: ref.itemId })}
        />
      )}
    </WorkspaceShell>
  );
}
