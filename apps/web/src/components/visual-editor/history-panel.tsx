import { canonicalJson, fingerprint } from "@river/domain";
import { newIdentity, type Resume, type SaveRecord } from "@river/domain/workspace";
import { useQuery } from "@tanstack/react-query";
import { Download, History, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { fileBase64 } from "~/components/workspace/browser-import";
import { useRecordCommands, useRecords } from "~/components/workspace/queries";
import { inputClass } from "~/components/workspace/value-input";
import { getWorkspaceRecord } from "~/server/workspace";
import { getWorkspaceExports } from "~/server/workspace-export-functions";
import type { GeneratedPdf, usePdf } from "./pdf/use-pdf";
import type { EditorController } from "./use-editor-controller";

type PendingExport = { id: string; version: SaveRecord; pdf: GeneratedPdf };
export function HistoryPanel({
  id,
  controller: c,
  open,
  onOpenChange,
  pdf,
}: {
  id: string;
  controller: EditorController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdf: ReturnType<typeof usePdf>;
}) {
  const versions = useRecords("version"),
    commands = useRecordCommands();
  const exports = useQuery({
    queryKey: ["workspace", "exports", id],
    enabled: open,
    queryFn: async () => {
      const result = await getWorkspaceExports({ data: id });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const [name, setName] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<PendingExport | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const pendingVersion = useRef<SaveRecord | null>(null);
  const capture = async (snapshot: Resume, name: string): Promise<SaveRecord> => {
    if (!(await c.draft.flush()))
      throw Error("Resolve the save status before capturing a version.");
    const saved = await getWorkspaceRecord({ data: { kind: "resume", id } });
    if (
      !saved.ok ||
      saved.value.kind !== "resume" ||
      canonicalJson(saved.value.data) !== canonicalJson(snapshot)
    )
      throw Error("The draft changed while it was being saved. Try again with the current draft.");
    return {
      id: newIdentity(),
      revision: 0,
      idempotencyKey: newIdentity(),
      payload: {
        kind: "version",
        data: { version: 1, name, resumeId: id, draftRevision: saved.value.revision, snapshot },
      },
    };
  };
  const saveVersion = async () => {
    setBusy(true);
    setError(null);
    try {
      const input =
        pendingVersion.current ??
        (await capture(structuredClone(c.resume), name.trim() || "Saved version"));
      pendingVersion.current = input;
      await commands.save.mutateAsync(input);
      pendingVersion.current = null;
      setName("");
      setMessage("Named version saved. Its contents are immutable.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save version.");
    } finally {
      setBusy(false);
    }
  };
  const exportPdf = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let attempt = pending;
      if (!attempt) {
        if (!pdf.fresh || !pdf.result)
          throw Error("Wait for a current PDF that passes the text check.");
        const frozen = pdf.result;
        attempt = {
          id: newIdentity(),
          pdf: frozen,
          version: await capture(
            structuredClone(frozen.input),
            `PDF · ${new Date().toLocaleString()}`,
          ),
        };
        setPending(attempt);
      }
      await commands.save.mutateAsync(attempt.version);
      const file = attempt.pdf;
      const response = await fetch("/api/v2/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: attempt.id,
          versionId: attempt.version.id,
          idempotencyKey: attempt.id,
          pdfBase64: await fileBase64(file.blob),
          metadata: {
            renderer: file.renderer,
            fonts: file.fonts,
            text: file.text,
            pages: file.pages,
            byteLength: file.blob.size,
            digest: await fingerprint(new Uint8Array(await file.blob.arrayBuffer())),
            warnings: file.warnings,
          },
        }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        throw Error(
          result &&
            typeof result === "object" &&
            "title" in result &&
            typeof result.title === "string"
            ? result.title
            : "PDF upload failed. The exact generated file remains available to retry in this tab.",
        );
      }
      setPending(null);
      setMessage("PDF archived successfully. Download the retained file below.");
      await exports.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to archive this PDF.");
    } finally {
      setBusy(false);
    }
  };
  const rows =
    versions.data?.filter((row) => row.kind === "version" && row.data.resumeId === id) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">
            Versions and exports
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Saved versions preserve content and layout. Restoring one creates a new draft revision.
          Retained PDFs are the exact files generated at export time.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-primary">
            {message}
          </p>
        )}
        <div className="hidden gap-6 border-y py-5 lg:grid lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="font-medium">Save a named version</h3>
            <input
              aria-label="Version name"
              className={inputClass}
              placeholder="Product Engineer · first draft"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveVersion()}>
              <History />
              {pendingVersion.current ? "Retry frozen version" : "Save version"}
            </Button>
            {pendingVersion.current && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  pendingVersion.current = null;
                  setError(null);
                }}
              >
                Start with current draft
              </Button>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Generate and retain PDF</h3>
            <p role="status" className="text-xs text-muted-foreground">
              {pending
                ? "Upload pending. The frozen file remains in this tab."
                : pdf.pending
                  ? "Rendering PDF and checking text…"
                  : (pdf.error ??
                    (pdf.fresh
                      ? `${pdf.result?.pages} page(s) · text completeness checked`
                      : "Waiting for a current PDF…"))}
            </p>
            {pdf.result?.warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-800">
                {warning}
              </p>
            ))}
            <Button
              size="sm"
              disabled={busy || (!pending && !pdf.fresh)}
              onClick={() => void exportPdf()}
            >
              {busy ? "Saving…" : pending ? "Retry exact PDF upload" : "Archive PDF"}
            </Button>
            {pending && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                Discard pending upload
              </Button>
            )}
          </section>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-xs uppercase text-muted-foreground">
              Named versions and export snapshots
            </h3>
            {rows.map(
              (row) =>
                row.kind === "version" && (
                  <article key={row.id} className="space-y-2 rounded border p-4">
                    <h4 className="text-sm font-medium">{row.data.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()} · draft revision{" "}
                      {row.data.draftRevision}
                    </p>
                    <Button
                      className="hidden lg:inline-flex"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        c.updateResume(() => structuredClone(row.data.snapshot));
                        c.setSelection([]);
                        c.setEditing(null);
                        onOpenChange(false);
                      }}
                    >
                      <RotateCcw />
                      Restore as draft revision
                    </Button>
                  </article>
                ),
            )}
            {!rows.length && (
              <p className="text-sm text-muted-foreground">No saved versions yet.</p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="text-xs uppercase text-muted-foreground">Retained PDFs</h3>
            {exports.error && <p role="alert">{exports.error.message}</p>}
            {exports.data?.map((row) => (
              <article key={row.id} className="space-y-2 rounded border p-4">
                <p className="text-sm">
                  {new Date(row.createdAt).toLocaleString()} · {row.metadata.pages} page(s)
                </p>
                <p className="break-all text-xs text-muted-foreground">{row.metadata.renderer}</p>
                {row.state === "Complete" ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/api/v2/exports/${row.id}?download`}>
                      <Download />
                      Download retained PDF
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-amber-800">
                    Upload incomplete. Retry from the tab that holds the generated file.
                  </p>
                )}
              </article>
            ))}
            {!exports.data?.length && (
              <p className="text-sm text-muted-foreground">No PDFs archived yet.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
