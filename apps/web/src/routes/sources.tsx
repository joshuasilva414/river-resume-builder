import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { SourceAiPanel } from "~/components/evidence/source-ai";
import { SourceIntake } from "~/components/source-intake";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { cn } from "~/lib/utils";
import { getSession, getSource, getSources, reprocessSource } from "~/server/functions";

export const Route = createFileRoute("/sources")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: Sources,
});

function Sources() {
  const { user, environment } = Route.useRouteContext();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | undefined>(undefined);
  const [inspectorTab, setInspectorTab] = useState("text");
  const [search, setSearch] = useState("");
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const result = await getSources();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    refetchInterval: (query) =>
      query.state.data?.some((source) => ["Uploading", "Processing"].includes(source.state))
        ? 2500
        : false,
  });
  const selected = sources.data?.find((source) => source.id === selectedId);
  const inspection = useQuery({
    queryKey: ["source", selectedId, selected?.currentProcessingId, processingId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      if (!selectedId) throw Error("Select a source.");
      const result = await getSource({ data: { id: selectedId, processingId } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const retry = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const result = await reprocessSource({
        data: { id: selected.id, revision: selected.revision, idempotencyKey: crypto.randomUUID() },
      });
      if (!result.ok) throw Error(result.error.title);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["sources"] }),
  });
  const visible =
    sources.data?.filter((source) =>
      `${source.title} ${source.filename} ${source.note}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <WorkspaceShell user={user} environment={environment}>
      <header className="flex flex-col gap-4 border-b px-6 py-7 md:px-8">
        <p className="eyebrow">Workspace / Sources</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="page-heading">A record of your work.</h1>
            <p className="mt-2 text-muted-foreground">
              Original documents and the source history behind your evidence.
            </p>
          </div>
          <Button
            onClick={() => {
              setResuming(false);
              setOpen(true);
            }}
          >
            <Plus /> Add source
          </Button>
        </div>
      </header>
      {sources.error && (
        <Alert variant="destructive" className="m-6 w-auto">
          <AlertDescription>{sources.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid flex-1 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1fr)]">
        <section
          className="min-w-0 border-b p-6 lg:border-r lg:border-b-0"
          aria-label="Source library"
        >
          <Label className="sr-only" htmlFor="source-search">
            Search sources
          </Label>
          <Input
            id="source-search"
            placeholder="Search titles, filenames, or provenance"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="mt-5 border-b border-foreground pb-3 text-[13px] font-semibold">
            Sources · {visible.length}
          </p>
          {sources.isPending && (
            <p role="status" className="py-6">
              Loading sources…
            </p>
          )}
          {!sources.isPending && visible.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>
                  {search ? "No matching sources" : "Start with your sources"}
                </EmptyTitle>
                <EmptyDescription>
                  {search
                    ? "Try another title or filename."
                    : "Add project notes, transcripts, résumés, or an Owner attestation. Originals stay available after extraction."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {visible.map((source) => (
            <button
              type="button"
              key={source.id}
              aria-pressed={selectedId === source.id}
              onClick={() => {
                setSelectedId(source.id);
                setProcessingId(undefined);
                retry.reset();
              }}
              className={cn(
                "flex w-full items-start gap-3 border-b border-l-2 border-l-transparent px-3 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedId === source.id ? "border-l-primary bg-accent" : "hover:bg-muted",
              )}
            >
              <FileText className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{source.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {source.kind === "attestation" ? "Owner attestation" : source.filename} ·{" "}
                  {(source.byteLength / 1024).toFixed(1)} KiB
                </span>
              </span>
              <Badge variant="outline" className={source.state === "Ready" ? "text-approved" : ""}>
                {source.state}
              </Badge>
            </button>
          ))}
          {sources.data?.length === 200 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Showing the 200 most recent sources.
            </p>
          )}
        </section>
        <section className="min-w-0 p-6 md:p-7" aria-label="Source inspector">
          {!selected ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Select a source</EmptyTitle>
                <EmptyDescription>
                  Inspect the original, extracted text, and exact parser result.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="eyebrow">Source / Revision {selected.revision}</p>
                <h2 className="mt-3 break-words text-[28px] leading-tight">{selected.title}</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Added {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selected.state}</Badge>
                {selected.kind === "attestation" && (
                  <Badge variant="outline">Owner attestation</Badge>
                )}
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/v1/sources/${selected.id}?download`}>Download original</a>
                </Button>
                {["Ready", "Failed"].includes(selected.state) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate()}
                  >
                    {retry.isPending ? "Queuing…" : "Retry extraction"}
                  </Button>
                )}
              </div>
              {(selected.failure || retry.error || inspection.error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {retry.error?.message ?? inspection.error?.message ?? selected.failure}
                  </AlertDescription>
                </Alert>
              )}
              {selected.state === "Uploading" && (
                <Alert>
                  <AlertDescription>
                    The upload was interrupted. Resume with the exact original to keep this source
                    identity.
                  </AlertDescription>
                </Alert>
              )}
              {selected.state === "Processing" && (
                <p role="status" className="text-muted-foreground">
                  Extracting text. The original is safely stored.
                </p>
              )}
              {selected.state === "Uploading" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setResuming(true);
                    setOpen(true);
                  }}
                >
                  Resume upload
                </Button>
              )}
              {selected.provenanceUrl && (
                <a
                  href={selected.provenanceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary underline"
                >
                  {selected.provenanceUrl}
                </a>
              )}
              {selected.note && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selected.note}</p>
              )}
              {sources.data?.some(
                (source) => source.id !== selected.id && source.digest === selected.digest,
              ) && (
                <Alert>
                  <AlertDescription>
                    This source has the same bytes as another original. Both provenance records are
                    preserved.
                  </AlertDescription>
                </Alert>
              )}
              <SourceAiPanel
                key={selected.id}
                source={selected}
                processingId={processingId ?? selected.currentProcessingId}
                onExtraction={(id) => {
                  setProcessingId(id);
                  setInspectorTab("text");
                }}
              />
              <Tabs value={inspectorTab} onValueChange={setInspectorTab}>
                <TabsList variant="line">
                  <TabsTrigger value="text">Extracted text</TabsTrigger>
                  <TabsTrigger value="provenance">Provenance</TabsTrigger>
                </TabsList>
                <TabsContent value="text">
                  {processingId && processingId !== selected.currentProcessingId && (
                    <Alert>
                      <AlertDescription>
                        Viewing a historical extraction.{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setProcessingId(undefined)}
                        >
                          Return to current text
                        </button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {inspection.isFetching ? (
                    <p role="status">Loading text…</p>
                  ) : inspection.data?.extraction ? (
                    <pre className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words py-4 font-sans text-sm leading-7">
                      {inspection.data.extraction.text ||
                        "No text was found. This document may need a text version."}
                    </pre>
                  ) : (
                    <p className="py-4 text-muted-foreground">
                      Extracted text will appear when processing finishes.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="provenance" className="flex flex-col gap-5 pt-4">
                  <dl className="grid gap-2 text-xs">
                    <dt className="text-muted-foreground">Original SHA-256</dt>
                    <dd className="break-all font-mono">{selected.digest}</dd>
                    <dt className="text-muted-foreground">Source identity</dt>
                    <dd className="break-all font-mono">{selected.id}</dd>
                  </dl>
                  {inspection.data?.history.map((result) => (
                    <article key={result.id} className="border-t pt-4 text-xs">
                      <p className="font-medium">
                        {result.parser} {result.parserVersion}
                      </p>
                      <p className="mt-2 break-all font-mono">{result.id}</p>
                      <p className="mt-2 text-muted-foreground">
                        {result.characterCount.toLocaleString()} characters ·{" "}
                        {new Date(result.createdAt).toLocaleString()}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setProcessingId(result.id);
                          setInspectorTab("text");
                        }}
                      >
                        View this extraction
                      </Button>
                      {result.id === selected.currentProcessingId && (
                        <Badge variant="outline" className="mt-2">
                          Current extraction
                        </Badge>
                      )}
                    </article>
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </section>
      </div>
      <SourceIntake
        key={resuming ? selected?.id : "new"}
        resume={resuming && selected ? selected : undefined}
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => {
          setSelectedId(id);
          setProcessingId(undefined);
        }}
      />
    </WorkspaceShell>
  );
}
