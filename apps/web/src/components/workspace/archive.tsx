import { useQuery } from "@tanstack/react-query";
import { Archive, Download, FileText } from "lucide-react";
import { useState } from "react";
import { PdfPreview } from "~/components/pdf-preview";
import { Button } from "~/components/ui/button";
import { cutoverWorkspace, getWorkspaceArchive, readWorkspaceArchive } from "~/server/workspace";
import { getArchivedFiles } from "~/server/workspace-archive-functions";
import { inputClass } from "./value-input";

const labels: Record<string, string> = {
  contexts: "Contexts",
  evidence: "Evidence",
  content: "Content",
  templates: "Templates",
  resumes: "Résumés",
  versions: "Saved versions",
  artifacts: "Retained files",
  scorecards: "Earlier scorecards",
};
function HistoricalValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value !== "object")
    return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
  if (depth > 6)
    return (
      <span className="text-muted-foreground">
        Open the original JSON for deeper nested values.
      </span>
    );
  const entries = Object.entries(value);
  return (
    <dl className="space-y-3">
      {entries.slice(0, 100).map(([key, item]) => (
        <div key={key} className="border-l pl-3">
          <dt className="text-[11px] text-muted-foreground">
            {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
          </dt>
          <dd className="mt-1 text-xs leading-5">
            {item !== null && typeof item === "object" ? (
              <details>
                <summary className="cursor-pointer">
                  {Array.isArray(item) ? `${item.length} items` : "Details"}
                </summary>
                <div className="mt-2">
                  <HistoricalValue value={item} depth={depth + 1} />
                </div>
              </details>
            ) : (
              <HistoricalValue value={item} depth={depth + 1} />
            )}
          </dd>
        </div>
      ))}
      {entries.length > 100 && (
        <p className="text-xs text-muted-foreground">
          Showing 100 items. Download the original JSON for the full record.
        </p>
      )}
    </dl>
  );
}
function ArchiveDetail({ id, category }: { id: string; category: string }) {
  const [preview, setPreview] = useState(false);
  const record = useQuery({
    queryKey: ["workspace", "archive", category, id],
    queryFn: async () => {
      const result = await readWorkspaceArchive({ data: { id, category } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const files = useQuery({
    queryKey: ["workspace", "archive-files", id],
    enabled: category === "artifacts",
    queryFn: async () => {
      const result = await getArchivedFiles({ data: id });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  if (record.isPending) return <p>Loading archived record…</p>;
  if (record.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {record.error.message}
      </p>
    );
  if (!record.data) return null;
  const data = record.data;
  const value: unknown = JSON.parse(data.data);
  const pdf = files.data?.find((file) => file.kind === "pdf");
  return (
    <div className="space-y-6">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {labels[category] ?? category} · read-only
      </p>
      <h2 className="break-words font-serif text-[28px] font-normal leading-[34px]">{data.name}</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Archived {new Date(data.archivedAt).toLocaleString()}. Original values and source
        associations are preserved.
      </p>
      {files.error && (
        <p role="alert" className="text-sm text-destructive">
          {files.error.message}
        </p>
      )}
      {pdf?.status === "Available" && (
        <>
          <Button className="w-full" asChild>
            <a href={`/api/v2/archive/${id}/pdf?download`}>
              <Download />
              Download original PDF
            </a>
          </Button>
          <Button variant="outline" onClick={() => setPreview(!preview)}>
            {preview ? "Hide PDF" : "Preview retained PDF"}
          </Button>
          {preview && <PdfPreview url={`/api/v2/archive/${id}/pdf`} />}
        </>
      )}
      {pdf && pdf.status !== "Available" && (
        <p role="status" className="rounded border p-3 text-sm">
          {pdf.status === "Expired"
            ? "This temporary preview expired. River does not re-render historical templates."
            : "The PDF is unavailable in artifact storage. This historical record remains preserved."}
        </p>
      )}
      {!!files.data?.length && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            All retained artifacts
          </summary>
          <div className="mt-3 space-y-2">
            {files.data.map((file) => (
              <div key={file.kind} className="flex items-center justify-between text-xs">
                <span>
                  {file.kind.toUpperCase()} · {file.status}
                </span>
                {file.status === "Available" && (
                  <a className="text-primary" href={`/api/v2/archive/${id}/${file.kind}?download`}>
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([data.data], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `river-archive-${id}.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }}
      >
        Download original record JSON
      </Button>
      <details open={category !== "artifacts"}>
        <summary className="cursor-pointer text-sm">Archived record details</summary>
        <div className="mt-4">
          <HistoricalValue value={value} />
        </div>
      </details>
    </div>
  );
}
export default function WorkspaceArchive() {
  const archive = useQuery({
    queryKey: ["workspace", "archive"],
    queryFn: async () => {
      const result = await getWorkspaceArchive();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const [category, setCategory] = useState("artifacts"),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const rows =
    archive.data?.records.filter(
      (row) => row.category === category && row.name.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-6 border-b px-6 py-7 xl:px-12">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            River / previous workspace
          </p>
          <h1 className="font-serif text-[40px] leading-[44px]">Your earlier work, preserved.</h1>
          <p className="text-sm text-muted-foreground">
            Browse historical records and download the files you retained. This archive is
            read-only.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/facts">Return to Fact Bank</a>
        </Button>
      </header>
      {(error || archive.error) && (
        <p role="alert" className="p-6 text-destructive">
          {error ?? archive.error?.message}
        </p>
      )}
      {archive.isPending ? (
        <p className="p-8">Loading archive…</p>
      ) : !archive.data?.manifest ? (
        <section className="max-w-2xl space-y-5 p-8">
          <Archive className="text-muted-foreground" />
          <h2 className="font-serif text-2xl">Preserve the previous workspace</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Archive your earlier evidence, content, templates, résumés and file manifests. Accounts,
            settings, sources and job targets stay in place. New facts and content use the fresh
            workspace.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await cutoverWorkspace({
                  data: { idempotencyKey: "workspace-cutover-v1" },
                });
                if (!result.ok) throw Error(result.error.title);
                await archive.refetch();
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Archive did not complete. Retry safely.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Archiving…" : "Archive previous workspace"}
          </Button>
        </section>
      ) : (
        <div className="flex flex-col lg:flex-row">
          <nav
            aria-label="Archive categories"
            className="flex shrink-0 flex-wrap gap-2 border-b p-6 lg:max-h-[calc(100dvh-250px)] lg:overflow-y-auto lg:w-52 lg:flex-col lg:gap-3 lg:border-r xl:w-60"
          >
            <p className="w-full pb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Archived material
            </p>
            {Object.entries(labels).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={category === key}
                className={`flex items-center justify-between gap-4 rounded p-3 text-left text-sm ${category === key ? "bg-primary/5 text-primary" : "hover:bg-muted"}`}
                onClick={() => {
                  setCategory(key);
                  setSelected(null);
                }}
              >
                <span>{label}</span>
                <span>{archive.data?.manifest?.counts[key] ?? 0}</span>
              </button>
            ))}
            <p className="pt-4 text-xs leading-5 text-muted-foreground">
              Counts include retained revisions. No historical templates are converted.
            </p>
          </nav>
          <section className="min-w-0 flex-1 space-y-5 border-r p-6 lg:max-h-[calc(100dvh-250px)] lg:overflow-y-auto xl:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-[28px] font-normal leading-[34px]">
                {labels[category]}
              </h2>
              <span className="text-xs text-muted-foreground">{rows.length} records</span>
            </div>
            <input
              aria-label="Search archive"
              className={inputClass}
              placeholder="Search this archive…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div>
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`flex w-full items-start gap-4 border-b px-4 py-5 text-left ${selected === row.id ? "rounded border border-primary/40 bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => setSelected(row.id)}
                >
                  <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-3 text-sm">{row.name}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      Archived {new Date(row.archivedAt).toLocaleDateString()}
                    </span>
                  </span>
                </button>
              ))}
              {!rows.length && (
                <p className="py-8 text-sm text-muted-foreground">
                  No archived records in this category match your search.
                </p>
              )}
            </div>
          </section>
          <aside className="min-w-0 border-t p-6 lg:max-h-[calc(100dvh-250px)] lg:overflow-y-auto lg:w-[38%] lg:border-t-0 xl:p-8">
            {selected ? (
              <ArchiveDetail key={selected} id={selected} category={category} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a record to view its original values and retained files.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
