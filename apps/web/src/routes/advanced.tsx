import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAiSettings } from "~/components/ai-selection";
import { Failure, FormField, selectClass, unwrap } from "~/components/evidence/shared";
import { TemplateEditor } from "~/components/templates/editor";
import { AdvancedRenderingContext, type TemplateDetail } from "~/components/templates/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getAdvancedRecord } from "~/server/advanced-functions";
import { getSession } from "~/server/functions";

const kinds = [
  "template",
  "job",
  "source",
  "wording",
  "duplicate",
  "refinement",
  "checkpoint",
] as const;
type Kind = (typeof kinds)[number];
export const Route = createFileRoute("/advanced")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: AdvancedPage,
});

function AdvancedPage() {
  const session = Route.useRouteContext(),
    settings = useAiSettings();
  const [kind, setKind] = useState<Kind>("template"),
    [id, setId] = useState(""),
    [selected, setSelected] = useState<{ kind: Kind; id: string } | null>(null),
    [editing, setEditing] = useState<
      { kind: "create" } | { kind: "edit"; detail: TemplateDetail } | null
    >(null);
  const record = useQuery({
    queryKey: ["advanced-record", settings.data?.ownerId, selected],
    enabled: Boolean(selected && settings.data?.preferences.advancedTools),
    queryFn: async () => {
      if (!selected) throw Error("Choose a record");
      return unwrap(await getAdvancedRecord({ data: selected }));
    },
    retry: false,
  });
  const exported = record.data?.kind === "checkpoint" ? record.data.detail.operation : null;
  return (
    <WorkspaceShell {...session}>
      <div className="space-y-6 p-6 md:p-10">
        <h1 className="page-heading">Advanced tools</h1>
        <p className="max-w-2xl text-muted-foreground">
          Inspect saved task inputs and document internals. These tools are optional for building
          and exporting a résumé.
        </p>
        {!settings.data?.preferences.advancedTools ? (
          <p>
            Enable Advanced tools in{" "}
            <Link to="/settings" className="text-primary underline">
              Settings
            </Link>{" "}
            to continue.
          </p>
        ) : (
          <>
            <form
              className="flex max-w-3xl flex-wrap items-end gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setSelected({ kind, id });
              }}
            >
              <FormField label="Record type">
                <select
                  className={selectClass}
                  value={kind}
                  onChange={(event) => {
                    const next = kinds.find((value) => value === event.target.value);
                    if (next) setKind(next);
                  }}
                >
                  {kinds.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Record or template revision ID">
                <Input
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                  required
                  placeholder="UUID"
                />
              </FormField>
              <Button>Inspect record</Button>
            </form>
            <Button variant="outline" onClick={() => setEditing({ kind: "create" })}>
              Create a template in the code editor
            </Button>
            {record.isFetching && <p role="status">Loading technical details…</p>}
            <Failure error={record.error} />
            {record.data && (
              <>
                <div className="flex gap-3">
                  {record.data.kind === "template" && (
                    <Button
                      onClick={() => {
                        if (record.data?.kind === "template")
                          setEditing({ kind: "edit", detail: record.data.detail });
                      }}
                    >
                      Edit template code
                    </Button>
                  )}
                  {exported?.artifacts &&
                    ["tex", "report"].map((format) => (
                      <a
                        key={format}
                        className="text-primary underline"
                        href={`/api/artifacts/${exported.id}/${format}?download`}
                      >
                        Download {format === "tex" ? "LaTeX source" : "JSON report"}
                      </a>
                    ))}
                </div>
                <pre className="max-h-[65vh] overflow-auto rounded-lg border bg-muted p-5 text-xs">
                  {JSON.stringify(record.data.detail, null, 2)}
                </pre>
              </>
            )}
            {editing && (
              <AdvancedRenderingContext.Provider value={true}>
                <TemplateEditor
                  advanced
                  initialBase={
                    editing.kind === "edit"
                      ? { kind: "saved", revisionId: editing.detail.revision.id }
                      : { kind: "fixed", theme: "classic" }
                  }
                  detail={editing.kind === "edit" ? editing.detail : undefined}
                  onClose={() => setEditing(null)}
                  onSaved={(revisionId) => {
                    setEditing(null);
                    setId(revisionId);
                    setSelected({ kind: "template", id: revisionId });
                  }}
                />
              </AdvancedRenderingContext.Provider>
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
