import { EvidenceType, RecordId } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { Plus, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { ClaimEditor } from "~/components/evidence/claim-editor";
import { EvidenceInspector } from "~/components/evidence/inspector";
import { Failure, selectClass, unwrap, useEvidenceDetail } from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { WorkspaceShell } from "~/components/workspace-shell";
import { cn } from "~/lib/utils";
import { getEvidence } from "~/server/evidence-functions";
import { getSession } from "~/server/functions";

export const Route = createFileRoute("/evidence")({
  validateSearch: (search: Record<string, unknown>): { claimId?: string } => ({
    claimId: Schema.is(RecordId)(search.claimId) ? search.claimId : undefined,
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: EvidencePage,
});
function EvidencePage() {
  const session = Route.useRouteContext(),
    { claimId } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(claimId ?? null);
  const [search, setSearch] = useState(""),
    query = useDeferredValue(search);
  const [type, setType] = useState<EvidenceType>(),
    [trash, setTrash] = useState(false),
    [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const evidence = useQuery({
    queryKey: ["evidence", "list", query, type, trash, offset],
    queryFn: async () =>
      unwrap(
        await getEvidence({
          data: {
            query,
            type,
            archived: trash,
            status: "All",
            contextId: null,
            offset,
          },
        }),
      ),
  });
  const detail = useEvidenceDetail(selectedId);
  return (
    <WorkspaceShell {...session}>
      <header className="space-y-5 border-b px-6 py-8 md:px-8">
        <p className="eyebrow">Workspace / Evidence</p>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="page-heading">Evidence</h1>
            <p className="mt-2 text-muted-foreground">
              Your experience, achievements, and skills, ready to use.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link to="/sources">Extract from a source</Link>
            </Button>
            <Button onClick={() => setEditor("new")}>
              <Plus /> Add evidence
            </Button>
          </div>
        </div>
      </header>
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section
          aria-label="Evidence bank"
          className="min-w-0 border-b p-6 lg:border-r lg:border-b-0"
        >
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-44 flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Search evidence"
                className="pl-9"
                placeholder="Search text or keywords"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <select
              aria-label="Evidence type"
              className={cn(selectClass, "w-auto")}
              value={type ?? ""}
              onChange={(event) => {
                setType(EvidenceType.literals.find((item) => item === event.target.value));
                setOffset(0);
              }}
            >
              <option value="">All types</option>
              {EvidenceType.literals.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <Button
              variant={trash ? "secondary" : "outline"}
              aria-pressed={trash}
              onClick={() => {
                setTrash(!trash);
                setOffset(0);
                setSelectedId(null);
              }}
            >
              <Trash2 /> Trash
            </Button>
          </div>
          <p className="mt-5 border-b border-foreground pb-3 text-sm font-semibold">
            {trash ? "Trash" : "Evidence"} · {evidence.data?.total ?? 0}
          </p>
          <Failure error={evidence.error} />
          {evidence.isPending && (
            <p role="status" className="py-6">
              Loading evidence…
            </p>
          )}
          {evidence.data?.items.length === 0 && (
            <p className="py-10 text-muted-foreground">
              {trash
                ? "Your evidence trash is empty."
                : "Add evidence directly or extract it from a source."}
            </p>
          )}
          {evidence.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-pressed={selectedId === item.id}
              className={cn(
                "flex w-full flex-col gap-3 border-b border-l-2 border-l-transparent p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedId === item.id ? "border-l-primary bg-accent" : "hover:bg-muted",
              )}
            >
              <Badge variant="outline">{item.metadata.type ?? "Other"}</Badge>
              <span className="whitespace-pre-wrap break-words leading-7">{item.assertion}</span>
              {item.metadata.tags.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {item.metadata.tags.join(" · ")}
                </span>
              )}
            </button>
          ))}
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {Math.floor(offset / 50) + 1}
            </span>
            <Button
              variant="outline"
              disabled={!evidence.data?.hasMore}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        </section>
        <section className="min-w-0 p-6 md:p-8" aria-label="Selected evidence">
          <Failure error={detail.error} />
          {detail.data ? (
            <EvidenceInspector
              key={detail.data.claim.id}
              detail={detail.data}
              onAction={() => setEditor("edit")}
              onTrash={() => setSelectedId(null)}
            />
          ) : (
            <p className="py-10 text-muted-foreground">
              Select an evidence item to view or edit it.
            </p>
          )}
        </section>
      </div>
      {(editor === "new" || (editor === "edit" && detail.data)) && (
        <ClaimEditor
          detail={editor === "edit" ? detail.data : undefined}
          onClose={() => setEditor(null)}
          onSaved={setSelectedId}
        />
      )}
    </WorkspaceShell>
  );
}
