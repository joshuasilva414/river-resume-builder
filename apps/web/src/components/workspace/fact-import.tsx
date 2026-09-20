import { newId } from "@river/domain";
import {
  blankValue,
  type CandidateFact,
  type FactContext,
  newIdentity,
  populated,
  valueKindSchema,
} from "@river/domain/workspace";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { importWorkspaceFacts } from "~/server/workspace";
import { requestFactImport } from "~/server/workspace-ai";
import { submitExtractedSource } from "~/server/workspace-sources";
import { fileBase64, type ParsedFile, parseCandidateFile } from "./browser-import";
import { inputClass, ValueInput } from "./value-input";

export default function FactImport() {
  const client = useQueryClient();
  const [text, setText] = useState(""),
    [title, setTitle] = useState("Imported candidate information"),
    [file, setFile] = useState<ParsedFile | null>(null),
    [facts, setFacts] = useState<CandidateFact[]>([]),
    [contexts, setContexts] = useState<FactContext[]>([]),
    [excluded, setExcluded] = useState<string[]>([]),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false),
    [saveSource, setSaveSource] = useState(true);
  const [identity] = useState(() => ({
    sourceId: newId(),
    sourceKey: newIdentity(),
    importKey: newIdentity(),
  }));
  const [sourceSaved, setSourceSaved] = useState(false);
  const selected = facts.filter((fact) => !excluded.includes(fact.id));
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Import failed. Your edits are preserved.");
    } finally {
      setBusy(null);
    }
  }
  const addFact = () =>
    setFacts([
      ...facts,
      {
        id: newIdentity(),
        key: "detail",
        label: "New fact",
        contextId: contexts[0]?.id ?? null,
        sourceId: null,
        value: blankValue("text"),
      },
    ]);
  const update = (id: string, fn: (fact: CandidateFact) => CandidateFact) =>
    setFacts(facts.map((fact) => (fact.id === id ? fn(fact) : fact)));
  return (
    <div className="flex flex-col gap-7 p-5 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b pb-6">
        <div>
          <a href="/facts" className="text-xs text-muted-foreground">
            FACT BANK / IMPORT
          </a>
          <h1 className="mt-3 font-serif font-normal text-4xl">Choose what to keep.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Edit the proposed facts, then add your selection together.
          </p>
        </div>
        <Button
          disabled={
            !!busy ||
            saved ||
            !selected.length ||
            selected.some((fact) => !populated(fact.value) || !fact.label.trim())
          }
          onClick={() =>
            run("Saving selected facts…", async () => {
              if (saveSource && !sourceSaved) {
                const result = await submitExtractedSource({
                  data: {
                    id: identity.sourceId,
                    idempotencyKey: identity.sourceKey,
                    title,
                    filename: file?.original.name ?? "pasted-text.txt",
                    mime: file?.mime ?? "text/plain",
                    text,
                    parser: file?.parser ?? "pasted-text",
                    parserVersion: file?.parserVersion ?? "1",
                    originalBase64: file ? await fileBase64(file.original) : undefined,
                    provenanceUrl: null,
                    note: "",
                  },
                });
                if (!result.ok) throw Error(result.error.title);
                setSourceSaved(true);
              }
              const used = new Set(selected.map((fact) => fact.contextId));
              const result = await importWorkspaceFacts({
                data: {
                  idempotencyKey: identity.importKey,
                  contexts: contexts.filter((context) => used.has(context.id)),
                  facts: selected.map((fact) => ({
                    ...fact,
                    sourceId: saveSource || sourceSaved ? identity.sourceId : null,
                  })),
                },
              });
              if (!result.ok) throw Error(result.error.title);
              await client.invalidateQueries({ queryKey: ["workspace"] });
              setSaved(true);
            })
          }
        >
          {busy ?? (saved ? "Facts added" : `Add ${selected.length} selected facts`)}
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved ? (
        <div className="rounded border p-8">
          <h2 className="font-serif font-normal text-2xl">Your facts are ready.</h2>
          <p className="my-3 text-muted-foreground">
            Create reusable content from any selection in your Fact Bank.
          </p>
          <Button asChild>
            <a href="/facts">Open Fact Bank</a>
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(280px,0.8fr)_minmax(400px,1.8fr)]">
          <section className="flex flex-col gap-4 bg-muted/40 p-6">
            <label className="text-xs uppercase text-muted-foreground" htmlFor="import-file">
              Source document
            </label>
            <input
              id="import-file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              disabled={!!busy || sourceSaved}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected)
                  void run("Reading document…", async () => {
                    const parsed = await parseCandidateFile(selected);
                    setFile(parsed);
                    setText(parsed.text);
                    setTitle(selected.name);
                    setFacts([]);
                    setContexts([]);
                    setExcluded([]);
                  });
              }}
            />
            {file?.warnings.map((warning) => (
              <p key={warning} role="status" className="text-sm text-muted-foreground">
                {warning}
              </p>
            ))}
            <label className="text-sm">
              Source title
              <input
                className={`${inputClass} mt-2 w-full`}
                value={title}
                disabled={sourceSaved}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-2 text-sm">
              Extracted or pasted text
              <textarea
                className={`${inputClass} min-h-72 flex-1 resize-y leading-6`}
                placeholder="Paste information about your experience…"
                value={text}
                disabled={sourceSaved}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveSource}
                disabled={sourceSaved}
                onChange={(event) => setSaveSource(event.target.checked)}
              />
              Save original and extracted text to Sources
            </label>
            <Button
              disabled={!!busy || !text.trim() || facts.length > 0}
              onClick={() =>
                run("Proposing typed facts…", async () => {
                  const result = await requestFactImport({
                    data: { text, idempotencyKey: newIdentity() },
                  });
                  if (!result.ok) throw Error(result.error.title);
                  setFacts(result.value.preview.facts);
                  setContexts(result.value.preview.contexts);
                  setExcluded([]);
                })
              }
            >
              Propose facts with AI
            </Button>
            <p className="text-xs text-muted-foreground">
              Uses your configured content AI provider. You can also add facts manually. No OCR is
              performed.
            </p>
          </section>
          <section className="flex flex-col gap-4" aria-label="Editable import preview">
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-normal text-2xl">Import preview</h2>
              <Button
                variant="outline"
                onClick={() =>
                  setContexts([
                    ...contexts,
                    { id: newIdentity(), label: "New context", kind: "custom" },
                  ])
                }
              >
                Add context
              </Button>
            </div>
            {contexts.map((context) => (
              <div key={context.id} className="flex gap-2">
                <input
                  aria-label="Context name"
                  className={`${inputClass} flex-1`}
                  value={context.label}
                  onChange={(event) =>
                    setContexts(
                      contexts.map((item) =>
                        item.id === context.id ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
                <select
                  aria-label="Context type"
                  className={inputClass}
                  value={context.kind}
                  onChange={(event) => {
                    const kind = ["employment", "project", "education", "profile", "custom"].find(
                      (kind) => kind === event.target.value,
                    );
                    if (kind)
                      setContexts(
                        contexts.map((item) =>
                          item.id === context.id
                            ? { ...item, kind: kind as FactContext["kind"] }
                            : item,
                        ),
                      );
                  }}
                >
                  {["employment", "project", "education", "profile", "custom"].map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
              </div>
            ))}
            {!facts.length && (
              <p className="rounded border border-dashed p-8 text-sm text-muted-foreground">
                Choose a file or paste text, then request suggestions. You can add and edit facts
                here without AI.
              </p>
            )}
            {facts.map((fact) => (
              <article
                key={fact.id}
                className={`space-y-3 rounded border p-5 ${excluded.includes(fact.id) ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-primary">
                    <input
                      type="checkbox"
                      checked={!excluded.includes(fact.id)}
                      onChange={() =>
                        setExcluded(
                          excluded.includes(fact.id)
                            ? excluded.filter((id) => id !== fact.id)
                            : [...excluded, fact.id],
                        )
                      }
                    />
                    INCLUDE
                  </label>
                  <select
                    aria-label="Fact type"
                    className={inputClass}
                    value={fact.value.kind}
                    onChange={(event) =>
                      update(fact.id, (item) => ({
                        ...item,
                        value: blankValue(valueKindSchema.parse(event.target.value)),
                      }))
                    }
                  >
                    {valueKindSchema.options.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <input
                    aria-label="Fact label"
                    className={`${inputClass} flex-1`}
                    value={fact.label}
                    onChange={(event) =>
                      update(fact.id, (item) => ({ ...item, label: event.target.value }))
                    }
                  />
                  <select
                    aria-label="Fact context"
                    className={inputClass}
                    value={fact.contextId ?? ""}
                    onChange={(event) =>
                      update(fact.id, (item) => ({
                        ...item,
                        contextId: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">No context</option>
                    {contexts.map((context) => (
                      <option key={context.id} value={context.id}>
                        {context.label}
                      </option>
                    ))}
                  </select>
                </div>
                <ValueInput
                  value={fact.value}
                  onChange={(value) => update(fact.id, (item) => ({ ...item, value }))}
                />
              </article>
            ))}
            <Button variant="ghost" className="self-start text-primary" onClick={addFact}>
              + Add a fact
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
