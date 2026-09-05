import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PdfPreview } from "~/components/pdf-preview";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { type HistorySnapshot, snapshotLabel } from "./selection";

function Pane({ snapshot, label }: { snapshot: HistorySnapshot; label: string }) {
  const pdf = snapshot.pdf,
    manifest = pdf?.manifest;
  const expiresAt =
    manifest?.expiresAt ??
    (snapshot.selection.kind === "draft" && pdf ? pdf.createdAt + 7 * 24 * 60 * 60 * 1000 : null);
  const expired = expiresAt !== null && expiresAt <= Date.now();
  const stale =
    pdf?.revision !== snapshot.revision ||
    manifest?.templateIdentity !== snapshot.content.templateIdentity;
  return (
    <section className="min-w-0 space-y-4 rounded-md border p-4">
      <h3 className="font-editorial text-xl">{label} PDF</h3>
      <p className="text-sm">{snapshotLabel(snapshot)}</p>
      {snapshot.selection.kind === "draft" && (
        <p className="text-xs text-muted-foreground">
          Saved revision only. Unsaved browser edits are not part of this pinned comparison.
        </p>
      )}
      {pdf && (
        <p className="font-mono text-xs break-all">
          Artifact operation {pdf.id} · {pdf.state} · Rendered r{pdf.revision}
        </p>
      )}
      {snapshot.request && snapshot.request.id !== pdf?.id && (
        <p className="text-sm">
          At comparison load: {snapshot.request.stage}. Load this version again to inspect a later
          result.
        </p>
      )}
      {manifest && pdf?.state === "Succeeded" && !expired ? (
        <>
          <p className={cn("text-sm", stale && "text-warning")}>
            {stale
              ? `Earlier PDF · showing r${pdf.revision}; compare content for the selected revision.`
              : "PDF matches the pinned revision and template."}
          </p>
          <PdfPreview key={pdf.id} url={`/api/artifacts/${pdf.id}/pdf`} />
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["pdf", "Open PDF"],
                ["tex", "LaTeX"],
                ["text", "Extracted text"],
                ["report", "Validation report"],
              ] as const
            ).map(([kind, title]) => (
              <a
                key={kind}
                className="inline-flex min-h-11 items-center text-primary underline"
                href={`/api/artifacts/${pdf.id}/${kind}`}
                target="_blank"
                rel="noreferrer"
              >
                {title}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-md bg-muted p-4 text-sm">
          {expired
            ? "This transient preview expired."
            : `The selected PDF is unavailable${pdf ? ` (${pdf.stage})` : ""}.`}{" "}
          Saved content remains available. Open the original review or editor to prepare or retry
          its document, then load this version again.
        </p>
      )}
      {snapshot.selection.kind === "checkpoint" ? (
        <Link
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-primary underline text-sm"
          to="/checkpoints/$checkpointId"
          params={{ checkpointId: snapshot.selection.id }}
        >
          Open original checkpoint review
        </Link>
      ) : (
        <Link
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-primary underline text-sm"
          to="/resumes/$resumeId"
          params={{ resumeId: snapshot.draftId }}
        >
          Open editor in a new tab
        </Link>
      )}
    </section>
  );
}
export function HistoryPdf({ before, after }: { before: HistorySnapshot; after: HistorySnapshot }) {
  const [side, setSide] = useState("before");
  return (
    <div className="space-y-4">
      <fieldset className="flex gap-3 md:hidden" aria-label="PDF to inspect">
        {(["before", "after"] as const).map((value) => (
          <Button
            key={value}
            variant={side === value ? "default" : "outline"}
            aria-pressed={side === value}
            onClick={() => setSide(value)}
          >
            {value === "before" ? "Base PDF" : "Compare PDF"}
          </Button>
        ))}
      </fieldset>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className={cn("min-w-0", side !== "before" && "hidden md:block")}>
          <Pane snapshot={before} label="Base" />
        </div>
        <div className={cn("min-w-0", side !== "after" && "hidden md:block")}>
          <Pane snapshot={after} label="Compare" />
        </div>
      </div>
    </div>
  );
}
