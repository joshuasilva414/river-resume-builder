import { type AiSelection, canonicalJson, type JobImportAnalysis } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import {
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation } from "~/server/functions";
import { getJobImport, importJob, retryImportJob } from "~/server/job-import-functions";
import { type JobDetail, useJobCommand } from "./shared";

type Row = JobImportAnalysis["requirements"][number] & { key: string };
const emptyDetails = { role: "", company: "", location: "" };
/** Paper BIP-0 and BKS-0: one review commits the job and selected requirements together. */
export function JobImport({
  detail,
  onClose,
  onSaved,
}: {
  detail?: JobDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState(detail?.snapshot.url ?? "");
  const [text, setText] = useState("");
  const [ai, setAi] = useState<AiSelection>();
  const [importId, setImportId] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [details, setDetails] = useState(detail?.job.details ?? emptyDetails);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const initialized = useRef<string | null>(null),
    generation = useRef(0);
  const command = useRef<{ payload: string; key: string } | null>(null);
  const started = useMutation({
    mutationFn: async () => {
      const run = generation.current;
      const input = { input: { url: url.trim() || null, text: mode === "paste" ? text : "" }, ai };
      setImportId(null);
      setReview(false);
      setRows([]);
      setSelected(new Set());
      setAnalysisText(null);
      if (mode === "url") setText("");
      const payload = canonicalJson(input);
      if (command.current?.payload !== payload)
        command.current = { payload, key: crypto.randomUUID() };
      const outcome = unwrap(
        await importJob({ data: { ...input, idempotencyKey: command.current.key } }),
      );
      command.current = null;
      if (run !== generation.current) {
        // Closing/cancelling while submission is in flight still cancels its eventual operation.
        unwrap(
          await cancelDocumentOperation({
            data: { operationId: outcome.revisionId ?? "", idempotencyKey: crypto.randomUUID() },
          }),
        );
        return;
      }
      initialized.current = null;
      setImportId(outcome.id);
      setCancelled(false);
      setReview(false);
    },
  });
  const result = useQuery({
    queryKey: ["job-import", importId],
    queryFn: async () => unwrap(await getJobImport({ data: { id: importId ?? "" } })),
    enabled: Boolean(importId),
    refetchInterval: (query) =>
      ["Pending", "Running"].includes(query.state.data?.operation?.state ?? "") ? 1000 : false,
  });
  const active =
    started.isPending || ["Pending", "Running"].includes(result.data?.operation?.state ?? "");
  const imported = result.data?.imported;
  useEffect(() => {
    if (!imported || cancelled || initialized.current === `${imported.id}:${imported.revision}`)
      return;
    if (["Pending", "Running"].includes(result.data?.operation?.state ?? "")) return;
    initialized.current = `${imported.id}:${imported.revision}`;
    if (imported.text) {
      setText(imported.text);
      setUrl(imported.retrievedUrl ?? imported.input.url ?? "");
    }
    if (imported.analysis) {
      setDetails(imported.analysis.details);
      const next = imported.analysis.requirements.map((item) => ({
        ...item,
        key: crypto.randomUUID(),
      }));
      setRows(next);
      setSelected(new Set(next.map((item) => item.key)));
      setAnalysisText(imported.text);
      setReview(true);
    }
  }, [imported, result.data?.operation?.state, cancelled]);
  const cancellation = useMutation({
    mutationFn: async () => {
      generation.current++;
      setCancelled(true);
      if (imported)
        unwrap(
          await cancelDocumentOperation({
            data: { operationId: imported.latestOperationId, idempotencyKey: crypto.randomUUID() },
          }),
        );
      if (imported?.text) setText(imported.text);
      if (importId) await result.refetch();
    },
  });
  const retry = useMutation({
    mutationFn: async () => {
      if (!imported) return;
      unwrap(
        await retryImportJob({
          data: {
            id: imported.id,
            revision: imported.revision,
            idempotencyKey: `job-import-retry:${imported.id}:${imported.revision}`,
          },
        }),
      );
      setCancelled(false);
      initialized.current = null;
      await result.refetch();
    },
  });
  const save = useJobCommand((outcome) => {
    void client.invalidateQueries({ queryKey: ["job-import"] });
    onSaved(outcome.id);
    onClose();
  });
  const changed = analysisText !== null && analysisText !== text;
  const close = () => {
    if (active) void cancellation.mutateAsync().finally(onClose);
    else onClose();
  };
  const editRow = (key: string, patch: Partial<Row>) =>
    setRows((value) => value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: string) => {
    setRows((value) => value.filter((row) => row.key !== key));
    setSelected((value) => new Set([...value].filter((id) => id !== key)));
  };
  const saveReviewed = () =>
    save.mutate({
      type: "import",
      importId: cancelled ? null : importId,
      target: detail ? { id: detail.job.id, revision: detail.job.revision } : null,
      details,
      posting: { text, url: url.trim() || null },
      requirements: rows.filter((row) => selected.has(row.key)).map(({ key: _key, ...row }) => row),
    });
  return (
    <EvidenceDialog
      title={detail ? "Refresh posting" : "Import job"}
      description={
        detail
          ? "Review the refreshed posting before saving. Existing résumés keep their earlier posting."
          : "Import a public URL or paste a description, then review the job and requirements."
      }
      onClose={close}
      wide
      pending={save.isPending}
    >
      <div className="space-y-6">
        <Failure
          error={started.error ?? result.error ?? cancellation.error ?? retry.error ?? save.error}
        />
        {!review && (
          <>
            <div className="flex gap-2">
              <Button
                variant={mode === "url" ? "default" : "outline"}
                disabled={active}
                onClick={() => setMode("url")}
              >
                Public URL
              </Button>
              <Button
                variant={mode === "paste" ? "default" : "outline"}
                disabled={active}
                onClick={() => setMode("paste")}
              >
                Paste text
              </Button>
            </div>
            {mode === "url" ? (
              <FormField label="Job posting URL">
                <Input
                  type="url"
                  maxLength={2048}
                  value={url}
                  disabled={active}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://company.com/careers/role"
                />
              </FormField>
            ) : (
              <FormField label="Job description">
                <Textarea
                  className="min-h-56"
                  maxLength={120000}
                  value={text}
                  disabled={active}
                  onChange={(event) => setText(event.target.value)}
                />
              </FormField>
            )}
            <AiSelector value={ai} onChange={setAi} disabled={active} />
            {active ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                <p role="status" className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" />
                  {started.isPending ? "Starting import…" : result.data?.operation?.stage}
                </p>
                <Button
                  variant="outline"
                  disabled={cancellation.isPending}
                  onClick={() => cancellation.mutate()}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={mode === "url" ? !url.trim() : !text.trim()}
                  onClick={() => {
                    generation.current++;
                    setCancelled(false);
                    started.mutate();
                  }}
                >
                  {importId ? "Analyze again" : "Import job"}
                </Button>
                <Button
                  variant="outline"
                  disabled={!text.trim()}
                  onClick={() => {
                    setReview(true);
                    setAnalysisText(null);
                  }}
                >
                  Enter details manually
                </Button>
              </div>
            )}
            {result.data?.operation?.failure && (
              <div role="alert" className="space-y-3 rounded-lg border p-4">
                <p>{result.data.operation.failure}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode("paste")}>
                    Paste description
                  </Button>
                  {imported && imported.attempts < 3 && (
                    <Button
                      variant="outline"
                      disabled={retry.isPending || active}
                      onClick={() => retry.mutate()}
                    >
                      Retry import
                    </Button>
                  )}
                </div>
                {text && (
                  <p className="text-sm text-muted-foreground">
                    Retrieved text is preserved. You can edit it or continue manually.
                  </p>
                )}
              </div>
            )}
            {cancelled && (
              <p role="status" className="rounded-lg border p-4">
                Import cancelled. Retrieved text is preserved; no job was saved.
              </p>
            )}
          </>
        )}
        {review && (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section className="space-y-4">
                <h3 className="font-editorial text-2xl">Job description</h3>
                {(["role", "company", "location"] as const).map((name) => (
                  <FormField
                    key={name}
                    label={
                      name === "role" ? "Role title" : name === "company" ? "Company" : "Location"
                    }
                  >
                    <Input
                      maxLength={200}
                      value={details[name]}
                      onChange={(event) =>
                        setDetails((value) => ({ ...value, [name]: event.target.value }))
                      }
                    />
                  </FormField>
                ))}
                <FormField label="Source URL">
                  <Input
                    type="url"
                    value={url}
                    maxLength={2048}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </FormField>
                <FormField label="Description">
                  <Textarea
                    className="min-h-72"
                    value={text}
                    maxLength={120000}
                    onChange={(event) => setText(event.target.value)}
                  />
                </FormField>
                {changed && (
                  <div
                    role="status"
                    className="space-y-2 rounded-lg border border-warning p-3 text-sm"
                  >
                    <p>
                      The description changed after analysis. Analyze the edited text or review and
                      confirm these requirements.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMode("paste");
                        setReview(false);
                      }}
                    >
                      Analyze edited text
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAnalysisText(text);
                        setRows((value) =>
                          value.map((row) => ({
                            ...row,
                            quote: text.includes(row.quote) ? row.quote : "",
                          })),
                        );
                      }}
                    >
                      I reviewed the requirements
                    </Button>
                  </div>
                )}
              </section>
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-editorial text-2xl">Requirements</h3>
                  <span className="text-sm">
                    {selected.size} of {rows.length} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelected(new Set(rows.map((row) => row.key)))}
                  >
                    Select all {rows.length}
                  </Button>
                  <Button variant="ghost" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Qualifications can match evidence. Eligibility is posting information only.
                </p>
                {rows.slice(offset, offset + 10).map((row) => (
                  <article key={row.key} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.text || "requirement"}`}
                        checked={selected.has(row.key)}
                        onChange={(event) =>
                          setSelected((value) => {
                            const next = new Set(value);
                            if (event.target.checked) next.add(row.key);
                            else next.delete(row.key);
                            return next;
                          })
                        }
                      />
                      <select
                        aria-label="Requirement type"
                        className={selectClass}
                        value={row.kind}
                        onChange={(event) =>
                          editRow(row.key, {
                            kind:
                              event.target.value === "Eligibility"
                                ? "Eligibility"
                                : "Qualification",
                          })
                        }
                      >
                        <option>Qualification</option>
                        <option>Eligibility</option>
                      </select>
                      <Button
                        variant="ghost"
                        aria-label="Delete requirement"
                        onClick={() => remove(row.key)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Textarea
                      aria-label="Requirement text"
                      value={row.text}
                      maxLength={2000}
                      onChange={(event) => editRow(row.key, { text: event.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        aria-label="Category"
                        value={row.category}
                        maxLength={60}
                        onChange={(event) => editRow(row.key, { category: event.target.value })}
                      />
                      <select
                        aria-label="Priority"
                        className={selectClass}
                        value={row.priority}
                        onChange={(event) =>
                          editRow(row.key, {
                            priority:
                              event.target.value === "Required"
                                ? "Required"
                                : event.target.value === "Preferred"
                                  ? "Preferred"
                                  : "Unspecified",
                          })
                        }
                      >
                        <option>Required</option>
                        <option>Preferred</option>
                        <option>Unspecified</option>
                      </select>
                    </div>
                    <Input
                      aria-label="Keywords, separated by commas"
                      value={row.keywords.join(", ")}
                      onChange={(event) =>
                        editRow(row.key, {
                          keywords: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </article>
                ))}
                {rows.length > 10 && (
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - 10))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      {offset + 1}–{Math.min(rows.length, offset + 10)} of {rows.length}
                    </span>
                    <Button
                      variant="outline"
                      disabled={offset + 10 >= rows.length}
                      onClick={() => setOffset(offset + 10)}
                    >
                      Next
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  disabled={rows.length >= 100}
                  onClick={() => {
                    const key = crypto.randomUUID();
                    setRows((value) => [
                      ...value,
                      {
                        key,
                        kind: "Qualification",
                        text: "",
                        category: "Skills",
                        priority: "Unspecified",
                        keywords: [],
                        quote: "",
                      },
                    ]);
                    setSelected((value) => new Set([...value, key]));
                    setOffset(Math.floor(rows.length / 10) * 10);
                  }}
                >
                  <Plus />
                  Add requirement
                </Button>
              </section>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setReview(false)}>
                Back
              </Button>
              <Button
                disabled={
                  save.isPending ||
                  changed ||
                  !text.trim() ||
                  !details.role.trim() ||
                  !details.company.trim() ||
                  rows.some(
                    (row) => selected.has(row.key) && (!row.text.trim() || !row.category.trim()),
                  )
                }
                onClick={saveReviewed}
              >
                {save.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  `Save job and ${selected.size} requirements`
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </EvidenceDialog>
  );
}
