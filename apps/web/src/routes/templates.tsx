import type { Theme } from "@river/domain";
import {
  fixedPack,
  type TemplateBase,
  type TemplateLifecycle,
  validateGraph,
} from "@river/templates";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { TemplateAiBrief } from "~/components/templates/ai-brief";
import { TemplateAiQueue } from "~/components/templates/ai-queue";
import { TemplateAiReview } from "~/components/templates/ai-review";
import { TemplateEditor } from "~/components/templates/editor";
import { TemplateMixer } from "~/components/templates/mix";
import {
  CodePayload,
  GraphView,
  type TemplateDetail,
  themes,
  useTemplate,
} from "~/components/templates/shared";
import { TemplateValidation } from "~/components/templates/validation";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";
import { getTemplateAiTasks } from "~/server/template-ai-functions";
import { getTemplates } from "~/server/template-functions";

export const Route = createFileRoute("/templates")({
  validateSearch: (search: Record<string, unknown>) => ({
    revisionId: typeof search.revisionId === "string" ? search.revisionId : undefined,
    proposals: search.proposals === true || search.proposals === "true" ? true : undefined,
    proposalId: typeof search.proposalId === "string" ? search.proposalId : undefined,
    designId: typeof search.designId === "string" ? search.designId : undefined,
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: TemplatesPage,
});
const themeDescriptions = {
  classic: "Editorial headings. Familiar structure.",
  minimal: "Clear hierarchy. Room to read.",
  technical: "Compact sections. Precise details.",
};
function TemplatesPage() {
  const session = Route.useRouteContext(),
    search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [state, setState] = useState<TemplateLifecycle | null>("Approved"),
    [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<{ base: TemplateBase; detail?: TemplateDetail } | null>(
      null,
    ),
    [mixer, setMixer] = useState(false),
    [builtin, setBuiltin] = useState<Theme | null>(null);
  const [brief, setBrief] = useState<{ base: TemplateBase; detail?: TemplateDetail } | null>(null);
  const ai = useQuery({
    queryKey: ["templates", "ai", "capabilities"],
    queryFn: async () =>
      unwrap(await getTemplateAiTasks({ data: { designId: null, state: null, offset: 0 } })),
  });
  const detail = useTemplate(search.revisionId ?? null);
  const list = useQuery({
    queryKey: ["templates", "search", state, offset],
    queryFn: async () => unwrap(await getTemplates({ data: { state, offset } })),
  });
  const select = (id?: string) =>
    void navigate({
      search: { revisionId: id, proposals: undefined, proposalId: undefined, designId: undefined },
    });
  const proposals = (designId?: string) =>
    void navigate({
      search: { revisionId: undefined, proposals: true, designId, proposalId: undefined },
    });
  const proposal = (id?: string) => void navigate({ search: { ...search, proposalId: id } });
  const saved = (id: string) => {
    setEditor(null);
    setMixer(false);
    setBrief(null);
    select(id);
  };
  return (
    <WorkspaceShell {...session} mobileFocus={Boolean(search.revisionId)}>
      <header className="space-y-4 border-b px-5 py-7 md:px-8">
        <p className="eyebrow">Workspace / Templates</p>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="page-heading">
              {search.proposals
                ? "Review the design."
                : search.revisionId
                  ? "Shape the template."
                  : "A form for your work."}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {search.proposals
                ? "Inspect saved candidates and their review decisions."
                : search.revisionId
                  ? "Inspect an exact saved graph and its validation history."
                  : "Choose a reviewed theme pack or shape a new one."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {search.revisionId || search.proposals ? (
              <Button variant="outline" onClick={() => select()}>
                <ArrowLeft />
                Back to templates
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setMixer(true)}>
                  Choose components
                </Button>
                <Button onClick={() => setEditor({ base: { kind: "fixed", theme: "classic" } })}>
                  <Plus />
                  Create template
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => proposals(detail.data?.design.id)}>
            Saved proposals
          </Button>
          {ai.data?.configured && (
            <Button
              variant="outline"
              onClick={() =>
                setBrief(
                  detail.data
                    ? {
                        base: { kind: "saved", revisionId: detail.data.revision.id },
                        detail: detail.data,
                      }
                    : { base: { kind: "fixed", theme: "classic" } },
                )
              }
            >
              {detail.data ? "Refine with AI" : "Describe a template"}
            </Button>
          )}
        </div>
      </header>
      {search.proposals ? (
        <TemplateAiQueue initialDesignId={search.designId} onSelect={proposal} onDraft={select} />
      ) : search.revisionId ? (
        <div className="space-y-5 px-5 py-6 md:px-8">
          <Failure error={detail.error} />
          {detail.isPending && <p role="status">Loading exact template revision…</p>}
          {detail.data && (
            <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-editorial text-3xl">{detail.data.design.name}</h2>
                  <Badge variant="outline">
                    {detail.data.revision.state} · revision {detail.data.revision.version}
                  </Badge>
                </div>
                <FormField label="Saved template revision">
                  <select
                    className={selectClass}
                    value={detail.data.revision.id}
                    onChange={(event) => select(event.target.value)}
                  >
                    {detail.data.revisions.map((revision) => (
                      <option key={revision.id} value={revision.id}>
                        Revision {revision.version} · {revision.state}
                      </option>
                    ))}
                  </select>
                </FormField>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (detail.data)
                      setEditor({
                        base: { kind: "saved", revisionId: detail.data.revision.id },
                        detail: detail.data,
                      });
                  }}
                >
                  Edit into new Draft revision
                </Button>
                <GraphView graph={detail.data.revision.graph} />
              </section>
              <aside className="min-w-0 space-y-5 xl:border-l xl:pl-7">
                <CodePayload
                  label="Exact graph identity"
                  value={{
                    revisionId: detail.data.revision.id,
                    digest: detail.data.revision.digest,
                    scope: detail.data.design.scope,
                  }}
                />
                <TemplateValidation detail={detail.data} />
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Captured component origins
                  </summary>
                  <div className="mt-4">
                    <CodePayload
                      label="Exact base and donor identities"
                      value={detail.data.revision.origins}
                    />
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Review history</summary>
                  <div className="mt-4 space-y-4">
                    {!detail.data.activity.length && (
                      <p className="text-sm">No review decisions yet.</p>
                    )}
                    {detail.data.activity.map((item) => (
                      <section key={item.id} className="space-y-2">
                        <p className="text-sm">
                          {item.command} · {new Date(item.createdAt).toLocaleString()}
                        </p>
                        <p className="break-all font-mono text-xs">Actor {item.actorId}</p>
                        <CodePayload label="Saved outcome" value={item.after} />
                      </section>
                    ))}
                  </div>
                </details>
              </aside>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5 md:px-8">
            <Tabs
              value={state ?? "all"}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "Approved" ||
                  value === "Draft" ||
                  value === "Validated" ||
                  value === "Retired"
                ) {
                  setState(value === "all" ? null : value);
                  setOffset(0);
                }
              }}
            >
              <TabsList variant="line">
                <TabsTrigger value="Approved">Approved</TabsTrigger>
                <TabsTrigger value="Draft">Drafts</TabsTrigger>
                <TabsTrigger value="Validated">Validated</TabsTrigger>
                <TabsTrigger value="Retired">Retired</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="eyebrow">Previews use synthetic content</p>
          </div>
          <div className="space-y-6 px-5 py-7 md:px-8">
            <Failure error={list.error} />
            {list.isPending && <p role="status">Loading templates…</p>}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {(state === null || state === "Approved") &&
                themes.map((theme) => (
                  <article key={theme} className="min-w-0 rounded-sm border">
                    <div className="space-y-2 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-editorial text-[26px] capitalize">{theme}</h2>
                        <Badge variant="outline">Built-in</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{themeDescriptions[theme]}</p>
                    </div>
                    <div className="border-y bg-muted/30 p-4">
                      <PdfPreview url={`/template-previews/${theme}-v1.pdf`} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                      <p className="eyebrow">Fixed revision 1</p>
                      <Button variant="outline" onClick={() => setBuiltin(theme)}>
                        Inspect pack
                      </Button>
                    </div>
                  </article>
                ))}
              {list.data?.items.map((item) => (
                <article
                  key={item.revisionId}
                  className="min-w-0 space-y-4 self-start rounded-sm border p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="break-words font-editorial text-[26px]">{item.name}</h2>
                    <Badge variant="outline">{item.state}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Complete saved graph · revision {item.version}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{item.digest}</p>
                  <Button variant="outline" onClick={() => select(item.revisionId)}>
                    Inspect revision
                  </Button>
                </article>
              ))}
            </div>
            {list.data && !list.data.items.length && state !== "Approved" && state !== null && (
              <p className="py-10 text-muted-foreground">
                No {state.toLowerCase()} custom revisions yet.
              </p>
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
          </div>
        </>
      )}
      {editor && (
        <TemplateEditor
          initialBase={editor.base}
          detail={editor.detail}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {mixer && <TemplateMixer onClose={() => setMixer(false)} onSaved={saved} />}
      {brief && (
        <TemplateAiBrief
          initialBase={brief.base}
          detail={brief.detail}
          onClose={() => setBrief(null)}
          onStarted={(id) => {
            setBrief(null);
            void navigate({
              search: {
                proposals: true,
                proposalId: id,
                revisionId: undefined,
                designId: brief.detail?.design.id,
              },
            });
          }}
        />
      )}
      {search.proposalId && (
        <TemplateAiReview id={search.proposalId} onClose={() => proposal()} onDraft={select} />
      )}
      {builtin && (
        <EvidenceDialog
          title={`${builtin[0]?.toUpperCase()}${builtin.slice(1)} · fixed revision 1`}
          description="This complete built-in graph uses pinned document resources. Editing creates a separate custom Draft."
          onClose={() => setBuiltin(null)}
          wide
        >
          <div className="space-y-5">
            <GraphView graph={validateGraph(fixedPack(builtin))} />
            <Button
              onClick={() => {
                setEditor({ base: { kind: "fixed", theme: builtin } });
                setBuiltin(null);
              }}
            >
              Create Draft from this pack
            </Button>
          </div>
        </EvidenceDialog>
      )}
    </WorkspaceShell>
  );
}
