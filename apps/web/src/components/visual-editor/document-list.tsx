import {
  emptyDefinition,
  newIdentity,
  standardTemplate,
  type VisualTemplate,
} from "@river/domain/workspace";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useRecordCommands, useRecords } from "~/components/workspace/queries";
export default function DocumentList({ kind }: { kind: "template" | "resume" }) {
  const records = useRecords(kind),
    commands = useRecordCommands(),
    [error, setError] = useState<string | null>(null);
  const create = async (blank = false) => {
    const id = newIdentity();
    let data = standardTemplate();
    if (blank) {
      const definition = emptyDefinition("Custom section");
      data = {
        version: 1,
        name: "Untitled template",
        page: { size: "LETTER", margin: 36 },
        style: { fontFamily: "sans", fontSize: 10, gap: 12 },
        definitions: [definition],
        sections: [
          {
            id: newIdentity(),
            key: "custom",
            label: "Custom section",
            definitionId: definition.id,
          },
        ],
      } satisfies VisualTemplate;
    }
    try {
      await commands.save.mutateAsync({
        id,
        revision: 0,
        idempotencyKey: newIdentity(),
        payload: { kind: "template", data },
      });
      window.location.assign(`/templates/${id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create template.");
    }
  };
  return (
    <div className="space-y-8 p-5 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-normal">
            {kind === "template" ? "Visual templates" : "Résumés"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {kind === "template"
              ? "Define reusable layouts, fields, labels, and repeating entries."
              : "Tailor content while your template takes care of the layout."}
          </p>
        </div>
        <div className="flex gap-2">
          {kind === "template" ? (
            <>
              <Button
                variant="outline"
                disabled={commands.save.isPending}
                onClick={() => void create(true)}
              >
                Start blank
              </Button>
              <Button disabled={commands.save.isPending} onClick={() => void create()}>
                Use editorial starter
              </Button>
            </>
          ) : (
            <Button asChild>
              <a href="/templates">Choose a template</a>
            </Button>
          )}
        </div>
      </header>
      {(error || records.error) && (
        <p role="alert" className="text-destructive">
          {error ?? records.error?.message}
        </p>
      )}
      {!records.isPending && !records.data?.length && (
        <div className="rounded border border-dashed p-10 text-center">
          <h2 className="font-serif text-2xl font-normal">
            {kind === "template" ? "Your first layout starts here." : "Build your first résumé."}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {kind === "template"
              ? "Choose a starter or compose your own custom structure."
              : "Open a template and choose Use template. Add facts, reusable content, or write directly."}
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {records.data?.map((record) => (
          <article key={record.id} className="space-y-4 rounded border p-6">
            <h2 className="font-serif text-2xl font-normal">
              <a href={`/${kind === "template" ? "templates" : "resumes"}/${record.id}`}>
                {"name" in record.data ? record.data.name : "Document"}
              </a>
            </h2>
            <p className="text-xs text-muted-foreground">
              Revision {record.revision} · {new Date(record.updatedAt).toLocaleDateString()}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`/${kind === "template" ? "templates" : "resumes"}/${record.id}`}>
                  Open {kind === "template" ? "designer" : "résumé"}
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await commands.remove.mutateAsync({
                      id: record.id,
                      revision: record.revision,
                      kind,
                    });
                  } catch (error) {
                    setError(error instanceof Error ? error.message : "Unable to delete document.");
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
