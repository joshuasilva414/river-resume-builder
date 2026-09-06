import { Theme } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowDownToLine, Check, FileText, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";
import { PdfPreview } from "~/components/pdf-preview";
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
import { Field, FieldLabel } from "~/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { cn } from "~/lib/utils";
import {
  cancelDocumentOperation,
  compileProof,
  getOperations,
  getSession,
} from "~/server/functions";

export const Route = createFileRoute("/runtime")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    if (!session.user.isAdmin || session.environment === "production")
      throw redirect({ to: "/jobs", replace: true });
    return { user: session.user, environment: session.environment };
  },
  component: Workspace,
});
function ArtifactText({ url }: { url: string }) {
  const result = useQuery({
    queryKey: ["artifact", url],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw Error("Unable to load this artifact.");
      return response.headers.get("Content-Type")?.includes("application/json")
        ? JSON.stringify(await response.json(), null, 2)
        : response.text();
    },
  });
  if (result.isPending)
    return (
      <p role="status" className="p-6">
        Loading artifact…
      </p>
    );
  if (result.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.message}</AlertDescription>
      </Alert>
    );
  return (
    <pre className="min-h-80 overflow-auto whitespace-pre-wrap break-words bg-background p-6 font-mono text-xs leading-6">
      {result.data}
    </pre>
  );
}
function Workspace() {
  const { user, environment } = Route.useRouteContext();
  const client = useQueryClient();
  const [theme, setTheme] = useState<Theme>("classic");
  const [selected, setSelected] = useState<string | null>(null);
  const operations = useQuery({
    queryKey: ["operations"],
    queryFn: async () => {
      const result = await getOperations();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    refetchInterval: (query) =>
      query.state.data?.some(
        (operation) => operation.state === "Pending" || operation.state === "Running",
      )
        ? 2000
        : false,
  });
  const compile = useMutation({
    mutationFn: async () => {
      const result = await compileProof({ data: { idempotencyKey: crypto.randomUUID(), theme } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["operations"] }),
  });
  const cancel = useMutation({
    mutationFn: async (operationId: string) => {
      const result = await cancelDocumentOperation({
        data: { operationId, idempotencyKey: crypto.randomUUID() },
      });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["operations"] }),
  });
  const successful = operations.data?.filter((operation) => operation.state === "Succeeded");
  const inspected = successful?.find((operation) => operation.id === selected) ?? successful?.[0];
  const artifactUrl = inspected ? `/api/artifacts/${inspected.id}` : null;
  const active = operations.data?.some(
    (operation) => operation.state === "Pending" || operation.state === "Running",
  );
  return (
    <WorkspaceShell user={user} environment={environment}>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b px-6 py-7 md:px-8">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Runtime verification</p>
          <h1 className="page-heading">From source to a finished document.</h1>
          <p className="max-w-xl text-muted-foreground">
            Compile a synthetic résumé and inspect the PDF, source, extracted text, and validation
            report.
          </p>
        </div>
      </div>
      <div className="grid flex-1 lg:grid-cols-[minmax(300px,.85fr)_minmax(400px,1.15fr)]">
        <section className="flex flex-col gap-6 border-b p-6 md:p-8 lg:border-r lg:border-b-0">
          <div className="flex items-end gap-3">
            <Field className="max-w-xs">
              <FieldLabel>Template pack</FieldLabel>
              <Select
                value={theme}
                onValueChange={(value) => setTheme(Schema.decodeUnknownSync(Theme)(value))}
              >
                <SelectTrigger className="w-full" aria-label="Template pack">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button disabled={compile.isPending || active} onClick={() => compile.mutate()}>
              {compile.isPending || active ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              Compile
            </Button>
          </div>
          {(operations.error || compile.error || cancel.error) && (
            <Alert variant="destructive">
              <AlertDescription>
                {operations.error?.message ?? compile.error?.message ?? cancel.error?.message}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-xl">Document operations</h2>
            <span className="eyebrow">
              {operations.isPending ? "Loading…" : `${operations.data?.length ?? 0} total`}
            </span>
          </div>
          {!operations.isPending && !operations.error && !operations.data?.length && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>
                  Choose a template and compile the sample to verify the document pipeline.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="flex flex-col gap-3" aria-live="polite">
            {operations.data?.map((operation) => (
              <article
                key={operation.id}
                className={cn(
                  "flex flex-col gap-3 rounded-sm border p-4 text-left",
                  inspected?.id === operation.id && "border-primary bg-accent/30",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">Synthetic résumé</span>
                  <Badge variant={operation.state === "Failed" ? "destructive" : "outline"}>
                    {operation.state === "Succeeded" && <Check data-icon="inline-start" />}
                    {operation.state}
                  </Badge>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {operation.failure ?? operation.stage}
                </p>
                <span className="eyebrow">{new Date(operation.createdAt).toLocaleString()}</span>
                {operation.artifacts && (
                  <span className="text-xs text-approved">
                    Text integrity passed · {(operation.artifacts.durationMs / 1000).toFixed(2)}s
                  </span>
                )}
                {operation.state === "Succeeded" && (
                  <Button variant="outline" size="sm" onClick={() => setSelected(operation.id)}>
                    Inspect document
                  </Button>
                )}
                {(operation.state === "Pending" || operation.state === "Running") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(operation.id)}
                  >
                    Cancel operation
                  </Button>
                )}
              </article>
            ))}
          </div>
        </section>
        <section aria-label="Document inspector" className="min-w-0 bg-muted p-5 md:p-8">
          {artifactUrl && inspected ? (
            <Tabs defaultValue="pdf">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <TabsList variant="line">
                  <TabsTrigger value="pdf">PDF</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="report">Report</TabsTrigger>
                  <TabsTrigger value="tex">LaTeX</TabsTrigger>
                </TabsList>
                <Button variant="outline" size="sm" asChild>
                  <a href={`${artifactUrl}/pdf?download`}>
                    <ArrowDownToLine data-icon="inline-start" />
                    Download PDF
                  </a>
                </Button>
              </div>
              <TabsContent value="pdf">
                <PdfPreview url={`${artifactUrl}/pdf`} />
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Page 1 · Download the PDF to inspect every page.
                </p>
              </TabsContent>
              <TabsContent value="text">
                <ArtifactText url={`${artifactUrl}/text`} />
              </TabsContent>
              <TabsContent value="report">
                <ArtifactText url={`${artifactUrl}/report`} />
              </TabsContent>
              <TabsContent value="tex">
                <ArtifactText url={`${artifactUrl}/tex`} />
                <Button variant="outline" className="mt-4" asChild>
                  <a href={`${artifactUrl}/tex?download`}>Download .tex</a>
                </Button>
              </TabsContent>
            </Tabs>
          ) : (
            <Empty className="min-h-96">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>Your PDF will appear here</EmptyTitle>
                <EmptyDescription>
                  The last successful document stays available while another is compiling.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
