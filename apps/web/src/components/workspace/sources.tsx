import { newId } from "@river/domain";
import { type ExtractedSource, newIdentity } from "@river/domain/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { getSource, getSources } from "~/server/functions";
import { submitExtractedSource } from "~/server/workspace-sources";
import { fileBase64, type ParsedFile, parseCandidateFile } from "./browser-import";
import { inputClass } from "./value-input";

export default function Sources() {
  const client = useQueryClient(),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false);
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const result = await getSources();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const detail = useQuery({
    queryKey: ["source", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      if (!selectedId) throw Error("Select a source.");
      const result = await getSource({ data: { id: selectedId } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const selected = sources.data?.find((source) => source.id === selectedId);
  return (
    <div className="space-y-7 p-5 lg:p-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-4xl">Sources</h1>
          <p className="mt-2 text-muted-foreground">
            Keep original documents and extracted text for optional provenance.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>Add source</Button>
      </header>
      {adding && (
        <SourceForm
          onSaved={(id) => {
            setAdding(false);
            setSelectedId(id);
            void client.invalidateQueries({ queryKey: ["sources"] });
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {(sources.error || detail.error) && (
        <p role="alert" className="text-destructive">
          {sources.error?.message ?? detail.error?.message}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <input
            className={inputClass}
            aria-label="Search sources"
            placeholder="Search titles or filenames"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {sources.data
            ?.filter((source) =>
              `${source.title} ${source.filename}`.toLowerCase().includes(search.toLowerCase()),
            )
            .map((source) => (
              <button
                type="button"
                key={source.id}
                onClick={() => setSelectedId(source.id)}
                aria-pressed={selectedId === source.id}
                className={`block w-full border-b p-4 text-left ${selectedId === source.id ? "bg-accent text-primary" : ""}`}
              >
                <span className="block font-medium">{source.title}</span>
                <span className="text-xs text-muted-foreground">
                  {source.filename} ·{" "}
                  {source.archivedAt
                    ? "Archived"
                    : source.currentProcessingId
                      ? "Text saved"
                      : "Original only"}
                </span>
              </button>
            ))}
          {!sources.isPending && !sources.data?.length && (
            <p className="py-10">Add a PDF, DOCX, text file, or pasted notes.</p>
          )}
        </section>
        <section className="space-y-5">
          {selected ? (
            <>
              <h2 className="font-serif text-3xl">{selected.title}</h2>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href={`/api/v2/sources/${selected.id}?download`}>Download original</a>
                </Button>
                {detail.data?.extraction?.text && (
                  <Button asChild>
                    <a href={`/facts/import?source=${selected.id}`}>Import facts from text</a>
                  </Button>
                )}
              </div>
              {selected.note && <p className="text-sm">{selected.note}</p>}
              {selected.provenanceUrl && (
                <a
                  className="text-primary underline"
                  href={selected.provenanceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source URL
                </a>
              )}
              {detail.data?.extraction ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {detail.data.extraction.parser} · {detail.data.extraction.parserVersion}
                  </p>
                  <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                    {detail.data.extraction.text}
                  </p>
                </>
              ) : (
                <p>
                  No extracted text is retained. Download the original and import it in this
                  browser. Scanned documents need pasted text.
                </p>
              )}
            </>
          ) : (
            <p className="p-8 text-muted-foreground">
              Select a source to read its text and download the original.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
function SourceForm({ onSaved, onClose }: { onSaved: (id: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [file, setFile] = useState<ParsedFile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState<ExtractedSource | null>(null);
  return (
    <section className="space-y-4 rounded border p-6">
      <h2 className="font-serif text-2xl">Add source</h2>
      <input
        aria-label="Source file"
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown"
        disabled={busy || !!pending}
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          setBusy(true);
          setError(null);
          try {
            const parsed = await parseCandidateFile(selected);
            setFile(parsed);
            setText(parsed.text);
            setTitle(selected.name);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Unable to parse this document. Paste its text below.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {file?.warnings.map((warning) => (
        <p key={warning} role="status" className="text-sm">
          {warning}
        </p>
      ))}
      <label className="block text-sm">
        Title
        <input
          className={inputClass}
          value={title}
          disabled={busy || !!pending}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Source URL (optional)
        <input
          className={inputClass}
          value={url}
          disabled={busy || !!pending}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Extracted or pasted text
        <textarea
          className={`${inputClass} min-h-48`}
          value={text}
          disabled={busy || !!pending}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          disabled={busy || !title.trim() || !text.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const input = pending ?? {
                id: newId(),
                idempotencyKey: newIdentity(),
                title,
                text,
                filename: file?.original.name ?? "pasted-text.txt",
                mime: file?.mime ?? "text/plain",
                parser: file?.parser ?? "pasted-text",
                parserVersion: file?.parserVersion ?? "1",
                originalBase64: file ? await fileBase64(file.original) : undefined,
                provenanceUrl: url || null,
                note: "",
              };
              setPending(input);
              const result = await submitExtractedSource({ data: input });
              if (!result.ok) throw Error(result.error.title);
              onSaved(result.value.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Save failed. Retry the same source.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : pending ? "Retry saved input" : "Save source"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
        {pending && (
          <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
            Edit input
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        PDF and DOCX extraction runs in this browser. No OCR or file-only server extraction.
      </p>
    </section>
  );
}
