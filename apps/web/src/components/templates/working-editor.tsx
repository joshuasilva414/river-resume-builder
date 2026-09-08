import type { SaveTemplateRequest, StartTemplateAiRequest } from "@river/contracts";
import { type AiSelection, builtInSchemaBundle, canonicalJson, newId } from "@river/domain";
import {
  scopedTemplate,
  type TemplateBase,
  type TemplateGraph,
  validateGraph,
} from "@river/templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { WorkingPreview } from "~/components/composition/working-preview";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { cancelDocumentOperation } from "~/server/functions";
import {
  generateTemplateAiTask,
  getTemplateAiTask,
  previewTemplateAiInput,
} from "~/server/template-ai-functions";
import {
  getTemplate,
  getTemplateValidation,
  previewWorkingTemplate,
  saveTemplateDraft,
  validateTemplateDraft,
} from "~/server/template-functions";
import { SchemaBuilder } from "./schema-builder";
import { BasePicker, type TemplateDetail, useTemplateBase } from "./shared";

export function TemplateEditor({
  initialBase,
  detail,
  onClose,
  onSaved,
}: {
  initialBase: TemplateBase;
  advanced?: boolean;
  detail?: TemplateDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const base = useTemplateBase(initialBase);
  if (base.graph)
    return (
      <TemplateWorkingCopy
        initialBase={initialBase}
        initialGraph={detail?.revision.graph ?? base.graph}
        detail={detail}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  return (
    <EvidenceDialog
      title={detail ? "Edit template" : "Create template"}
      description="Start with a design, describe changes, and inspect the sample. Save once when it is ready."
      onClose={onClose}
      wide
    >
      <Failure error={base.error} />
      <p role="status">Loading the starting design…</p>
    </EvidenceDialog>
  );
}
function TemplateWorkingCopy({
  initialBase,
  initialGraph,
  detail,
  onClose,
  onSaved,
}: {
  initialBase: TemplateBase;
  initialGraph: TemplateGraph;
  detail?: TemplateDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const client = useQueryClient();
  const [base, setBase] = useState(initialBase),
    [working, setWorking] = useState<TemplateGraph>({
      ...initialGraph,
      composition: initialGraph.composition ?? builtInSchemaBundle,
    });
  const [history, setHistory] = useState<TemplateGraph[]>([]),
    [messages, setMessages] = useState<{ id: string; kind: "user" | "assistant"; text: string }[]>(
      [],
    );
  const [name, setName] = useState(detail?.design.name ?? "My template"),
    [instruction, setInstruction] = useState(""),
    [ai, setAi] = useState<AiSelection>();
  const [conversationId] = useState(newId),
    turn = useRef(0),
    [taskId, setTaskId] = useState<string | null>(null);
  const consumed = useRef(new Set<string>()),
    cancelled = useRef(new Set<string>());
  const [previewed, setPreviewed] = useState<string | null>(null);
  const generation = useRef(0),
    [stopGeneration, setStopGeneration] = useState(false);
  const saveRequest = useRef<{
    payload: string;
    input: Omit<SaveTemplateRequest, "idempotencyKey">;
    key: string;
    validationKey: string;
    revisionId?: string;
    validationId?: string;
    operationId?: string;
    validationRevision?: number;
  } | null>(null);
  const savedDesign = useRef({
    id: detail?.design.id ?? null,
    revision: detail?.design.revision ?? null,
  });
  const [saveOperation, setSaveOperation] = useState<string | null>(null);
  const change = (next: TemplateGraph) => {
    setHistory((items) => [...items, working]);
    setWorking(next);
  };
  let problem: Error | null = null;
  try {
    validateGraph(working);
  } catch (error) {
    problem =
      error instanceof Error ? error : new Error("Check the template fields and dependencies.");
  }
  const identity = canonicalJson(working);
  const initialIdentity = useRef(identity);
  const selectedBase = useTemplateBase(base);
  const generate = useMutation({
    mutationFn: async () => {
      const attempt = ++generation.current;
      setStopGeneration(false);
      const request: StartTemplateAiRequest = {
        ai,
        id: null,
        revision: null,
        reservedDesignId: conversationId,
        name,
        base,
        workingGraph: working,
        scope: { level: "document", type: null },
        expectedInputDigest: null,
        idempotencyKey: crypto.randomUUID(),
        brief: {
          structure: "Single column",
          density: "Comfortable",
          character: "Preserve unspecified design choices.",
          constraints: "",
        },
        conversation: { id: conversationId, revision: turn.current, instruction, priorTaskIds: [] },
      };
      const preview = unwrap(await previewTemplateAiInput({ data: request }));
      const result = unwrap(
        await generateTemplateAiTask({ data: { ...request, expectedInputDigest: preview.digest } }),
      );
      turn.current++;
      if (attempt !== generation.current) {
        const late = unwrap(await getTemplateAiTask({ data: { id: result.id } }));
        if (late.operation)
          await cancelDocumentOperation({
            data: { operationId: late.operation.id, idempotencyKey: crypto.randomUUID() },
          });
        return null;
      }
      return { result, instruction };
    },
    onSuccess: (completed) => {
      if (!completed) return;
      const { result, instruction } = completed;
      setTaskId(result.id);
      setInstruction("");
      setMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), kind: "user", text: instruction },
      ]);
    },
  });
  const task = useQuery({
    queryKey: ["template-working-task", taskId],
    enabled: taskId !== null,
    queryFn: async () => {
      if (!taskId) throw new Error("No template task.");
      return unwrap(await getTemplateAiTask({ data: { id: taskId } }));
    },
    refetchInterval: (query) =>
      query.state.data?.operation &&
      ["Succeeded", "Failed", "Cancelled"].includes(query.state.data.operation.state)
        ? false
        : 1000,
  });
  useEffect(() => {
    const current = task.data;
    if (
      !current ||
      !taskId ||
      consumed.current.has(taskId) ||
      cancelled.current.has(taskId) ||
      current.operation?.state !== "Succeeded" ||
      !current.proposal?.payload ||
      !current.proposal.previewArtifacts?.validationPassed
    )
      return;
    consumed.current.add(taskId);
    setHistory((items) => [...items, working]);
    setWorking(current.proposal.payload.graph);
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        kind: "assistant",
        text: current.proposal?.payload?.explanation ?? "Updated the working copy.",
      },
    ]);
  }, [task.data, taskId, working]);
  const active =
    !stopGeneration &&
    (generate.isPending ||
      Boolean(taskId && !task.data && !cancelled.current.has(taskId)) ||
      Boolean(
        task.data?.operation &&
          ["Pending", "Running"].includes(task.data.operation.state) &&
          !cancelled.current.has(taskId ?? ""),
      ));
  const save = useMutation({
    mutationFn: async () => {
      const scope = detail?.design.scope ?? ({ level: "document", type: null } as const);
      const template = scopedTemplate(working, scope);
      const input = {
        name,
        base,
        scope,
        workingGraph: working,
        source: template.source,
        overrides: template.manifest.overrides,
      };
      const payload = canonicalJson(input);
      if (saveRequest.current?.payload !== payload)
        saveRequest.current = {
          payload,
          input: { ...input, ...savedDesign.current },
          key: crypto.randomUUID(),
          validationKey: crypto.randomUUID(),
        };
      const request = saveRequest.current;
      if (!request.revisionId) {
        const result = unwrap(
          await saveTemplateDraft({ data: { ...request.input, idempotencyKey: request.key } }),
        );
        if (!result.revisionId) throw new Error("Saved template is unavailable.");
        request.revisionId = result.revisionId;
        savedDesign.current = { id: result.id, revision: result.revision };
      }
      if (!request.validationId) {
        const saved = unwrap(await getTemplate({ data: { revisionId: request.revisionId } }));
        request.validationRevision ??= saved.revision.reviewRevision;
        const validation = unwrap(
          await validateTemplateDraft({
            data: {
              idempotencyKey: request.validationKey,
              revisionId: request.revisionId,
              revision: request.validationRevision,
              approveOnSuccess: true,
            },
          }),
        );
        request.validationId = validation.id;
        request.operationId = validation.revisionId ?? undefined;
      }
      setSaveOperation(request.operationId ?? null);
      for (;;) {
        const validation = unwrap(
          await getTemplateValidation({ data: { id: request.validationId } }),
        );
        if (validation.operation?.state === "Succeeded") {
          if (validation.template.revision.state !== "Approved")
            throw new Error(
              "The template did not pass its content checks. Your working copy is preserved.",
            );
          return request.revisionId;
        }
        if (
          validation.operation?.state === "Failed" ||
          validation.operation?.state === "Cancelled"
        ) {
          request.validationId = undefined;
          request.validationKey = crypto.randomUUID();
          request.validationRevision = undefined;
          throw new Error(
            validation.operation.failure ??
              "Template saving was cancelled. Your working copy is preserved.",
          );
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    },
    onSettled: () => setSaveOperation(null),
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: ["templates"] });
      onSaved(id);
    },
  });
  return (
    <EvidenceDialog
      title={detail ? "Edit template" : "Create template"}
      description="Start with a design, describe changes, and inspect the sample. Save once when it is ready."
      onClose={onClose}
      dirty={
        identity !== initialIdentity.current ||
        name !== (detail?.design.name ?? "My template") ||
        Boolean(instruction.trim())
      }
      pending={active || save.isPending}
      wide
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <FormField label="Template name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={save.isPending}
            />
          </FormField>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!history.length || active || save.isPending}
              onClick={() => {
                const previous = history.at(-1);
                if (previous) {
                  setWorking(previous);
                  setHistory(history.slice(0, -1));
                }
              }}
            >
              <Undo2 />
              Undo
            </Button>
            <Button
              type="button"
              disabled={
                Boolean(problem) ||
                active ||
                save.isPending ||
                previewed !== identity ||
                !name.trim()
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <section className="min-w-0 space-y-5 rounded-md border p-5">
            <BasePicker
              label="Starting design"
              value={base}
              disabled={active || save.isPending}
              onChange={setBase}
            />
            {canonicalJson(base) !== canonicalJson(initialBase) && selectedBase.graph && (
              <Button
                type="button"
                variant="outline"
                disabled={active || save.isPending}
                onClick={() => {
                  if (selectedBase.graph)
                    change({
                      ...selectedBase.graph,
                      composition: selectedBase.graph.composition ?? working.composition,
                    });
                }}
              >
                Use this starting design
              </Button>
            )}
            <ol className="space-y-4" aria-label="Template chat">
              {messages.map((message) => (
                <li
                  className={
                    message.kind === "user" ? "ml-6 rounded-md bg-muted p-4" : "mr-6 border-l-2 p-4"
                  }
                  key={message.id}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                </li>
              ))}
            </ol>
            <FormField label="Describe a change">
              <Textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                disabled={active || save.isPending}
                placeholder="Add GPA to Education, or make experience entries more compact…"
                rows={4}
              />
            </FormField>
            <AiSelector value={ai} onChange={setAi} />
            <Button
              type="button"
              disabled={!instruction.trim() || active || save.isPending || Boolean(problem)}
              onClick={() => generate.mutate()}
            >
              Update template
            </Button>
            {active && (
              <div className="flex items-center gap-3" role="status">
                <LoaderCircle className="size-4 animate-spin" />
                <span className="text-sm">Updating template…</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    generation.current++;
                    setStopGeneration(true);
                    if (taskId) cancelled.current.add(taskId);
                    if (task.data?.operation)
                      void cancelDocumentOperation({
                        data: {
                          operationId: task.data.operation.id,
                          idempotencyKey: crypto.randomUUID(),
                        },
                      }).then(() => task.refetch());
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
            <Failure error={generate.error ?? task.error} />
            {task.data?.operation?.state === "Failed" && (
              <p role="alert" className="text-sm">
                The change could not compile. Your working copy and previous PDF are preserved. Edit
                your instruction and try again.
              </p>
            )}
            {working.composition && (
              <SchemaBuilder
                bundle={working.composition}
                disabled={active || save.isPending}
                onChange={(composition) => change({ ...working, composition })}
              />
            )}
          </section>
          <aside className="min-w-0 rounded-md border bg-muted/20 p-5">
            <WorkingPreview
              identity={problem ? null : identity}
              request={async () =>
                unwrap(
                  await previewWorkingTemplate({
                    data: { idempotencyKey: crypto.randomUUID(), graph: working },
                  }),
                )
              }
              onReady={(identity) => setPreviewed(identity)}
            />
          </aside>
        </div>
        {save.isPending && (
          <div role="status" className="flex items-center gap-3">
            <LoaderCircle className="size-4 animate-spin" />
            <span className="text-sm">Saving and checking the sample PDFs…</span>
            {saveOperation && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void cancelDocumentOperation({
                    data: { operationId: saveOperation, idempotencyKey: crypto.randomUUID() },
                  });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
        <Failure error={problem ?? save.error} />
      </div>
    </EvidenceDialog>
  );
}
