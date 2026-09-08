import type { CreateSourceRequest } from "@river/contracts";
import { type AiSelection, canonicalJson, fingerprint } from "@river/domain";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { addSource, resumeUpload } from "~/server/functions";

export function SourceIntake({
  open,
  onOpenChange,
  onCreated,
  resume,
}: {
  resume?: { id: string; revision: number; title: string; mime: CreateSourceRequest["mime"] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const [ai, setAi] = useState<AiSelection>();
  const [file, setFile] = useState<File | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = useRef<{ digest: string; key: string; revision: number } | null>(null);
  const upload = useMutation({
    mutationFn: async (input: CreateSourceRequest) => {
      const result = resume
        ? await resumeUpload({
            data: {
              id: resume.id,
              revision: pending.current?.revision ?? resume.revision,
              idempotencyKey: input.idempotencyKey,
              contentBase64: input.contentBase64,
            },
          })
        : await addSource({ data: input });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["sources"] }),
  });
  const form = useForm({
    defaultValues: {
      title: resume?.title ?? "",
      mode: resume?.mime.startsWith("application/") ? "document" : "pasted",
      content: "",
      provenanceUrl: "",
      note: "",
    },
    onSubmit: async ({ value }) => {
      setFailure(null);
      try {
        let mime: CreateSourceRequest["mime"] = "text/plain";
        let filename = "source.txt";
        let bytes: Uint8Array;
        if (value.mode === "document") {
          if (!file) throw Error("Choose a document to upload.");
          if (file.size > 10 * 1024 * 1024 || file.size === 0)
            throw Error("Choose a nonempty file up to 10 MiB.");
          const extension = file.name.split(".").at(-1)?.toLowerCase();
          if (extension === "pdf") mime = "application/pdf";
          else if (extension === "docx")
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          else if (extension === "md" || extension === "markdown") mime = "text/markdown";
          else if (extension !== "txt") throw Error("Choose PDF, DOCX, TXT, or Markdown.");
          bytes = new Uint8Array(await file.arrayBuffer());
          filename = file.name;
        } else bytes = new TextEncoder().encode(value.content);
        if (bytes.length === 0) throw Error("Paste some source text first.");
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        const input = {
          ...(ai ? { ai } : {}),
          title: value.title.trim(),
          filename,
          mime,
          kind:
            value.mode === "attestation"
              ? ("attestation" as const)
              : value.mode === "document"
                ? ("document" as const)
                : ("pasted" as const),
          provenanceUrl: value.provenanceUrl.trim() || null,
          note: value.note.trim(),
          contentBase64: btoa(binary),
        };
        const digest = await fingerprint(canonicalJson(input));
        if (pending.current?.digest !== digest)
          pending.current = { digest, key: crypto.randomUUID(), revision: resume?.revision ?? 0 };
        const result = await upload.mutateAsync({ ...input, idempotencyKey: pending.current.key });
        pending.current = null;
        form.reset();
        setFile(null);
        onCreated(result.id);
        onOpenChange(false);
      } catch (error) {
        setFailure(
          error instanceof Error
            ? error.message
            : "The upload failed. Your input is still here; try again.",
        );
      }
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!upload.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{resume ? "Resume source upload" : "Add a source"}</DialogTitle>
          <DialogDescription>
            {resume
              ? "Select the exact original file or paste the same text. River checks it against the saved fingerprint."
              : "River keeps your original and extracts editable evidence with your selected AI connection."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="title">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="source-title">Title</FieldLabel>
                  <Input
                    id="source-title"
                    readOnly={Boolean(resume)}
                    required
                    maxLength={200}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Project notes, transcript, or résumé"
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="mode">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="source-mode">Source type</FieldLabel>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger id="source-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="pasted">Pasted text</SelectItem>
                        <SelectItem value="document">Document file</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.mode}>
              {(mode) =>
                mode === "document" ? (
                  <Field>
                    <FieldLabel htmlFor="source-file">Document</FieldLabel>
                    <Input
                      id="source-file"
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.markdown"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, TXT, or Markdown · up to 10 MiB · PDF up to 100 pages
                    </p>
                  </Field>
                ) : (
                  <form.Field name="content">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="source-content">
                          {mode === "attestation" ? "Your attestation" : "Source text"}
                        </FieldLabel>
                        <Textarea
                          id="source-content"
                          required
                          maxLength={500000}
                          className="min-h-44"
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {mode === "attestation"
                            ? "This source will be visibly identified as your own attestation."
                            : "Paste the original wording. Review extracted evidence before adding it."}
                        </p>
                      </Field>
                    )}
                  </form.Field>
                )
              }
            </form.Subscribe>
            <form.Field name="provenanceUrl">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="source-url">
                    Source URL <span className="font-normal text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="source-url"
                    type="url"
                    maxLength={2048}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="https://"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional link to where this source came from.
                  </p>
                </Field>
              )}
            </form.Field>
            <form.Field name="note">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="source-note">
                    Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </FieldLabel>
                  <Textarea
                    id="source-note"
                    maxLength={4000}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Where this came from and when it was captured"
                  />
                </Field>
              )}
            </form.Field>
            {!resume && <AiSelector value={ai} onChange={setAi} disabled={upload.isPending} />}
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            )}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving source…" : resume ? "Resume upload" : "Save source"}
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
