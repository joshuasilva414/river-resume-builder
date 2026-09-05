import type { EvidenceSearch } from "@river/contracts";
import { RecordId } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowLeft, FileCheck, Plus, Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { ClaimEditor } from "~/components/evidence/claim-editor";
import { ContextDialog } from "~/components/evidence/context-form";
import { DuplicateDialog } from "~/components/evidence/duplicate-ai";
import { EvidenceInspector } from "~/components/evidence/inspector";
import { ReviewDialog } from "~/components/evidence/review-dialog";
import {
  type EvidenceDetail,
  Failure,
  FormField,
  type SavedContext,
  selectClass,
  unwrap,
  useContexts,
  useEvidenceDetail,
} from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { cn } from "~/lib/utils";
import { getDuplicates, getEvidence } from "~/server/evidence-functions";
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
type Duplicate = Extract<Awaited<ReturnType<typeof getDuplicates>>, { ok: true }>["value"][number];
type DialogState =
  | { type: "create" }
  | { type: "edit" | "review" | "metadata" | "archive"; detail: EvidenceDetail }
  | { type: "context"; context?: SavedContext }
  | { type: "duplicate"; pair: Duplicate }
  | null;
const states: EvidenceSearch["status"][] = ["All", "Draft", "Needs clarification", "Verified"];
function EvidencePage() {
  const session = Route.useRouteContext();
  const { claimId } = Route.useSearch();
  const [tab, setTab] = useState("claims");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [status, setStatus] = useState<EvidenceSearch["status"]>("All");
  const [archived, setArchived] = useState<boolean | null>(false);
  const [contextId, setContext] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState(true);
  const [selectedId, setSelected] = useState<string | null>(claimId ?? null);
  useEffect(() => {
    if (claimId) setSelected(claimId);
  }, [claimId]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState("");
  const input = { query, status, archived, contextId, offset };
  const claims = useQuery({
    queryKey: ["evidence", "search", input],
    queryFn: async () => unwrap(await getEvidence({ data: input })),
    placeholderData: (previous) => previous,
  });
  const contexts = useContexts();
  const detail = useEvidenceDetail(selectedId);
  const duplicates = useQuery({
    queryKey: ["evidence", "duplicates"],
    queryFn: async () => unwrap(await getDuplicates()),
  });
  const onSaved = (id: string) => {
    setSelected(id);
    setTab("claims");
    setNotice("Claim saved. Review its evidence before using it.");
  };
  return (
    <WorkspaceShell {...session} mobileFocus={tab === "claims" && Boolean(selectedId)}>
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-5 border-b px-5 py-7 md:px-8",
          tab === "claims" && selectedId && "hidden xl:flex",
        )}
      >
        <div>
          <h1 className="page-heading">Evidence bank</h1>
          <p className="mt-2 text-muted-foreground">
            Facts, sources, and the decisions behind every claim.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/sources">Sources</Link>
          </Button>
          <Button onClick={() => setDialog({ type: "create" })}>
            <Plus />
            New claim
          </Button>
        </div>
      </header>
      <p
        role="status"
        className={
          notice
            ? cn(
                "border-b bg-accent px-6 py-3 text-accent-foreground",
                tab === "claims" && selectedId && "sr-only xl:not-sr-only",
              )
            : "sr-only"
        }
      >
        {notice}
      </p>
      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        <div
          className={cn(
            "overflow-x-auto border-b px-5 md:px-8",
            tab === "claims" && selectedId && "hidden xl:block",
          )}
        >
          <TabsList variant="line" className="h-[52px]">
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="duplicates">
              Possible duplicates
              {duplicates.data?.length
                ? ` · ${duplicates.data.length}${duplicates.data.length === 50 ? "+" : ""}`
                : ""}
            </TabsTrigger>
            <TabsTrigger value="contexts">Contexts</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="claims" className="mt-0">
          <div className="grid min-h-[calc(100dvh-235px)] xl:grid-cols-[660fr_576fr]">
            <section
              aria-label="Claims"
              className={cn("min-w-0 border-r p-5 md:p-6", selectedId && "hidden xl:block")}
            >
              <div className="mb-4 flex gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Search claims"
                    placeholder="Search facts, labels, or skills"
                    className="pl-9"
                    value={search}
                    maxLength={200}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  aria-expanded={filters}
                  onClick={() => setFilters(!filters)}
                >
                  Filters
                </Button>
              </div>
              {filters && (
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <FormField label="Status">
                    <select
                      className={selectClass}
                      value={status}
                      onChange={(event) => {
                        const value = states.find((value) => value === event.target.value);
                        if (value) setStatus(value);
                        setOffset(0);
                      }}
                    >
                      {states.map((state) => (
                        <option key={state}>{state}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Context">
                    <select
                      className={selectClass}
                      value={contextId ?? ""}
                      onChange={(event) => {
                        setContext(event.target.value || null);
                        setOffset(0);
                      }}
                    >
                      <option value="">All contexts</option>
                      {contexts.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Lifecycle">
                    <select
                      className={selectClass}
                      value={archived === null ? "all" : archived ? "archived" : "active"}
                      onChange={(event) => {
                        setArchived(
                          event.target.value === "all" ? null : event.target.value === "archived",
                        );
                        setOffset(0);
                      }}
                    >
                      <option value="active">Active only</option>
                      <option value="archived">Archived</option>
                      <option value="all">All claims</option>
                    </select>
                  </FormField>
                </div>
              )}
              <Failure error={claims.error} />
              {claims.error && (
                <Button variant="outline" onClick={() => void claims.refetch()}>
                  Retry search
                </Button>
              )}
              {claims.isPending && (
                <p role="status" className="py-6">
                  Loading claims…
                </p>
              )}
              {claims.data?.items.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {query || status !== "All" || contextId
                        ? "No matching claims"
                        : archived
                          ? "No archived claims"
                          : "Start with one fact"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {query || status !== "All" || contextId
                        ? "Try another term or clear the filters."
                        : "Write a factual assertion, attach its exact source passage, and review what it supports."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {!archived && !query && (
                    <Button onClick={() => setDialog({ type: "create" })}>New claim</Button>
                  )}
                </Empty>
              )}
              {claims.data?.items.map((claim) => (
                <button
                  key={claim.id}
                  type="button"
                  aria-pressed={selectedId === claim.id}
                  onClick={() => setSelected(claim.id)}
                  className={cn(
                    "flex w-full gap-3 border-b border-l-2 border-l-transparent px-3 py-[18px] text-left hover:bg-muted",
                    claim.id === selectedId && "border-l-primary bg-accent",
                  )}
                >
                  <FileCheck className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium leading-[22px]">
                      {claim.assertion}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {claim.metadata.label || "Claim"} ·{" "}
                      {new Date(claim.updatedAt).toLocaleDateString()}
                    </span>
                    {claim.metadata.tags.length > 0 && (
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {claim.metadata.tags.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="w-24 shrink-0 text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "whitespace-normal text-center",
                        claim.reviewState === "Verified" && "text-approved",
                      )}
                    >
                      {claim.reviewState}
                    </Badge>
                    {claim.archivedAt && (
                      <span className="mt-2 block text-xs text-muted-foreground">Archived</span>
                    )}
                  </span>
                </button>
              ))}
              {(offset > 0 || claims.data?.hasMore) && (
                <div className="flex justify-between gap-3 pt-5">
                  <Button
                    variant="outline"
                    disabled={offset === 0 || claims.isFetching}
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    Previous
                  </Button>
                  <p className="self-center text-xs">Page {offset / 50 + 1}</p>
                  <Button
                    variant="outline"
                    disabled={!claims.data?.hasMore || claims.isFetching}
                    onClick={() => setOffset(offset + 50)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </section>
            <section
              aria-label="Claim inspector"
              className={cn("min-w-0 p-5 md:p-7", !selectedId && "hidden xl:block")}
            >
              {selectedId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-5 xl:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft />
                  Back to claims
                </Button>
              )}
              {selectedId && (
                <h1 className="mb-6 text-[28px] leading-[34px] xl:hidden">Review evidence</h1>
              )}
              <Failure error={detail.error} />
              {detail.isFetching && (
                <p role="status" className="mb-3 text-muted-foreground">
                  Loading claim…
                </p>
              )}
              {detail.data ? (
                <EvidenceInspector
                  key={detail.data.claim.id}
                  detail={detail.data}
                  onAction={(type) => {
                    if (detail.data) setDialog({ type, detail: detail.data });
                  }}
                />
              ) : (
                !selectedId && (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Select a claim</EmptyTitle>
                      <EmptyDescription>
                        Inspect its exact citations, context snapshots, and review history.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="contexts" className="max-w-4xl p-5 md:p-8">
          <div className="mb-6 flex justify-between gap-4">
            <div>
              <h2 className="text-[28px]">Context records</h2>
              <p className="mt-2 text-muted-foreground">
                Shared background, pinned to the revision each claim uses.
              </p>
            </div>
            <Button variant="outline" onClick={() => setDialog({ type: "context" })}>
              New context
            </Button>
          </div>
          <Failure error={contexts.error} />
          {contexts.data?.length === 0 && (
            <p className="py-10 text-muted-foreground">
              Add a project, employment, education, credential, or Owner profile.
            </p>
          )}
          {contexts.data?.map((c) => (
            <article key={c.id} className="flex items-start justify-between gap-4 border-t py-5">
              <div className="min-w-0">
                <p className="font-medium">{c.data.label}</p>
                <p className="mt-2 text-muted-foreground">
                  {c.data.kind} · Revision {c.revision}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{c.data.details}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ type: "context", context: c })}
              >
                Edit context
              </Button>
            </article>
          ))}
        </TabsContent>
        <TabsContent value="duplicates" className="max-w-5xl p-5 md:p-8">
          <h2 className="text-[28px]">Possible duplicates</h2>
          <p className="mt-2 mb-6 text-muted-foreground">
            Similar wording is a review suggestion. Claims remain separate until you decide.
          </p>
          <Failure error={duplicates.error} />
          {duplicates.data?.length === 0 && (
            <p className="border-t py-10 text-muted-foreground">
              No possible duplicates awaiting review.
            </p>
          )}
          {duplicates.data?.map((pair) => (
            <article key={pair.id} className="space-y-4 border-t py-6">
              <div className="grid gap-5 sm:grid-cols-2">
                {[pair.first, pair.second].map(
                  (claim) =>
                    claim && (
                      <div key={claim.id}>
                        <p className="font-editorial text-xl leading-7">{claim.assertion}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {claim.reviewState} · Revision {claim.revision}
                        </p>
                      </div>
                    ),
                )}
              </div>
              <Button variant="outline" onClick={() => setDialog({ type: "duplicate", pair })}>
                Compare claims
              </Button>
            </article>
          ))}
        </TabsContent>
      </Tabs>
      {dialog?.type === "create" && (
        <ClaimEditor onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
      {dialog?.type === "edit" && (
        <ClaimEditor detail={dialog.detail} onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
      {(dialog?.type === "review" || dialog?.type === "metadata" || dialog?.type === "archive") && (
        <ReviewDialog
          detail={dialog.detail}
          action={dialog.type}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "context" && (
        <ContextDialog context={dialog.context} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "duplicate" && dialog.pair.first && dialog.pair.second && (
        <DuplicateDialog
          pair={{
            id: dialog.pair.id,
            revision: dialog.pair.revision,
            firstId: dialog.pair.first.id,
            secondId: dialog.pair.second.id,
          }}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}
    </WorkspaceShell>
  );
}
