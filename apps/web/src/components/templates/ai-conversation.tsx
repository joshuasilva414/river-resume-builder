import type { StartTemplateAiRequest } from "@river/contracts";
import type { AiSelection } from "@river/domain";
import { canonicalJson, newId } from "@river/domain";
import type { TemplateBase, TemplateScope } from "@river/templates";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AiSelector } from "~/components/ai-selection";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  generateTemplateAiTask,
  getTemplateConversation,
  previewTemplateAiInput,
} from "~/server/template-ai-functions";
import { TemplateAiInspection } from "./ai-review";
import {
  BasePicker,
  baseKey,
  CodePayload,
  GraphView,
  ScopePicker,
  scopeKey,
  scopeLabel,
  useTemplate,
  useTemplateBase,
  useTemplateCommand,
} from "./shared";

type Conversation = Extract<
  Awaited<ReturnType<typeof getTemplateConversation>>,
  { ok: true }
>["value"];
export function TemplateAiConversation({
  id,
  initialBase,
  onDraft,
}: {
  id: string;
  initialBase?: TemplateBase;
  onDraft: (id: string) => void;
}) {
  const initial = useQuery({
    queryKey: ["templates", "conversation", id, "initial"],
    queryFn: async () =>
      unwrap(
        await getTemplateConversation({
          data: { id, before: null, scope: { level: "document", type: null } },
        }),
      ),
  });
  return (
    <div className="px-5 py-6 md:px-8">
      <Failure error={initial.error} />
      {initial.isPending && <p role="status">Loading refinement conversation…</p>}
      {initial.data && (
        <ConversationBody
          key={id}
          initial={initial.data}
          initialBase={initialBase}
          onDraft={onDraft}
        />
      )}
    </div>
  );
}
function ConversationBody({
  initial,
  initialBase,
  onDraft,
}: {
  initial: Conversation;
  initialBase?: TemplateBase;
  onDraft: (id: string) => void;
}) {
  const [ai, setAi] = useState<AiSelection>();
  const [base, setBase] = useState<TemplateBase>(
    () =>
      initialBase ??
      initial.items[0]?.base ??
      (initial.design
        ? { kind: "saved", revisionId: initial.design.currentRevisionId }
        : { kind: "fixed", theme: "classic" }),
  );
  const [scope, setScope] = useState<TemplateScope>(
      initial.design?.scope ?? initial.items[0]?.scope ?? { level: "document", type: null },
    ),
    [instruction, setInstruction] = useState(""),
    [name, setName] = useState(initial.design?.name ?? initial.items[0]?.name ?? ""),
    [reserved, setReserved] = useState(newId),
    [selected, setSelected] = useState<string[] | null>(null),
    [inspectId, setInspectId] = useState<string | null>(null),
    [compareNewer, setCompareNewer] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["templates", "ai", "conversation", initial.id, scopeKey(scope)],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) =>
      unwrap(await getTemplateConversation({ data: { id: initial.id, before: pageParam, scope } })),
    getNextPageParam: (last) => last.nextBefore,
    refetchInterval: 5000,
  });
  const current = query.data?.pages[0];
  useEffect(() => {
    if (selected === null && current) setSelected(current.defaultTaskIds);
  }, [current, selected]);
  const turns = Array.from(
    new Map(
      query.data?.pages.flatMap((page) => page.items).map((turn) => [turn.id, turn]),
    ).values(),
  ).sort((a, b) => a.position - b.position);
  const graph = useTemplateBase(base);
  const saved = useTemplate(base.kind === "saved" ? base.revisionId : null);
  const destination =
    saved.data && scopeKey(saved.data.design.scope) === scopeKey(scope) ? saved.data.design : null;
  const input: StartTemplateAiRequest = {
    ai,
    id: destination?.id ?? null,
    revision: destination?.revision ?? null,
    reservedDesignId: destination?.id ?? reserved,
    name,
    base,
    scope,
    expectedInputDigest: null,
    idempotencyKey: "conversation-preflight",
    brief: {
      structure: "Single column",
      density: "Comfortable",
      character: "Follow the current design instruction; preserve unspecified styles.",
      constraints: "",
    },
    conversation: {
      id: initial.id,
      revision: current?.revision ?? initial.revision,
      instruction,
      priorTaskIds: selected ?? [],
    },
  };
  const preview = useMutation({
    mutationFn: async (request: StartTemplateAiRequest) => ({
      request,
      value: unwrap(await previewTemplateAiInput({ data: request })),
    }),
  });
  const reviewed =
    preview.data && canonicalJson(preview.data.request) === canonicalJson(input)
      ? preview.data.value
      : null;
  const generate = useTemplateCommand(
    async (request: StartTemplateAiRequest, key) =>
      unwrap(await generateTemplateAiTask({ data: { ...request, idempotencyKey: key } })),
    (result) => {
      setInstruction("");
      setReserved(newId());
      preview.reset();
      setInspectId(result.id);
    },
  );
  const changeBase = (next: TemplateBase) => {
    setBase(next);
    setCompareNewer(false);
    preview.reset();
  };
  const blocked =
    !current?.configured ||
    !current ||
    selected === null ||
    selected.length > 100 ||
    !instruction.trim() ||
    !name.trim() ||
    !graph.graph ||
    preview.isPending ||
    generate.isPending;
  const latest = saved.data?.design.currentRevisionId;
  const newer = useTemplate(compareNewer && latest ? latest : null);
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-5 rounded-md border p-6">
        <div>
          <h2 className="font-editorial text-[28px]">Refine with AI</h2>
          <p className="mt-2 eyebrow break-all">
            {name} · {initial.id}
          </p>
        </div>
        <Failure error={query.error} />
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Earlier turns
          </Button>
        )}
        <ol aria-label="Template refinement turns" className="space-y-6">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-3">
              <div className="ml-auto max-w-[90%] space-y-2 rounded-sm bg-muted/60 p-4">
                <p className="eyebrow">
                  You · Turn {turn.position} · {scopeLabel(turn.scope)}
                </p>
                <p className="whitespace-pre-wrap break-words text-base leading-6">
                  {turn.instruction}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  Base {baseKey(turn.base)} · {new Date(turn.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="max-w-[94%] space-y-3 border-l-2 p-4">
                <p className="font-semibold" role="status">
                  {turn.state === "Accepted"
                    ? "Proposal accepted · Draft saved"
                    : turn.state === "Rejected"
                      ? "Proposal rejected · Generated content discarded"
                      : turn.stage}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    aria-pressed={inspectId === turn.id}
                    onClick={() => setInspectId(turn.id)}
                  >
                    Inspect turn {turn.position}
                  </Button>
                  {turn.resultRevisionId && (
                    <>
                      <Button
                        variant="link"
                        onClick={() => {
                          if (turn.resultRevisionId) onDraft(turn.resultRevisionId);
                        }}
                      >
                        Open Draft
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (turn.resultRevisionId) {
                            changeBase({ kind: "saved", revisionId: turn.resultRevisionId });
                            setScope(turn.scope);
                            setSelected(null);
                            composer.current?.focus();
                          }
                        }}
                      >
                        Continue from this Draft
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {!turns.length && current && (
          <p className="text-muted-foreground">
            No instructions yet. Select an exact base and describe the first adjustment.
          </p>
        )}
        <div className="space-y-4 border-t pt-5">
          <BasePicker
            label="Exact base for next turn"
            value={base}
            onChange={changeBase}
            disabled={generate.isPending}
          />
          <ScopePicker
            value={scope}
            disabled={generate.isPending}
            onChange={(value) => {
              setScope(value);
              setSelected(null);
              preview.reset();
            }}
          />
          {base.kind === "saved" && latest && latest !== base.revisionId && (
            <div className="space-y-3 rounded-sm border p-4">
              <p>A newer revision exists. This composer still uses the selected base.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setInspectId(null);
                  setCompareNewer(true);
                }}
              >
                Compare with latest template
              </Button>
              <Button
                variant="outline"
                onClick={() => changeBase({ kind: "saved", revisionId: latest })}
              >
                Select newest revision explicitly
              </Button>
            </div>
          )}
          <FormField label="Resulting template name">
            <Input
              value={name}
              maxLength={160}
              disabled={generate.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          {!destination && (
            <p className="text-sm text-muted-foreground">
              Acceptance creates a separate template design for this component. The conversation
              stays together.
            </p>
          )}
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Earlier instructions · {selected?.length ?? 0} selected
            </summary>
            <p className="text-sm text-muted-foreground">
              Accepted instructions for this scope are selected by default. Only selected original
              instructions go into the next request.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSelected(current?.defaultTaskIds ?? [])}>
                Use accepted instructions for this scope
              </Button>
              <Button variant="outline" onClick={() => setSelected([])}>
                Clear selection
              </Button>
            </div>
            {selected && selected.length > 100 && (
              <p role="alert">
                More than 100 instructions are selected. Deselect instructions before reviewing
                input; nothing will be omitted automatically.
              </p>
            )}
            {turns.map((turn) => (
              <label
                key={turn.id}
                htmlFor={`prior-${turn.id}`}
                className="flex min-h-11 items-start gap-3 border-b py-3"
              >
                <Checkbox
                  id={`prior-${turn.id}`}
                  aria-label={`Include original instruction from turn ${turn.position}`}
                  checked={selected?.includes(turn.id) ?? false}
                  disabled={generate.isPending || selected === null}
                  onCheckedChange={(checked) =>
                    setSelected((value) =>
                      checked
                        ? [...(value ?? []), turn.id]
                        : (value ?? []).filter((id) => id !== turn.id),
                    )
                  }
                />
                <span className="min-w-0 space-y-2">
                  <span className="block text-sm font-semibold">
                    Turn {turn.position} · {scopeLabel(turn.scope)} ·{" "}
                    {turn.state ?? turn.operationState}
                  </span>
                  <span className="block whitespace-pre-wrap break-words text-base">
                    {turn.instruction}
                  </span>
                  <span className="block break-all font-mono text-xs">{turn.id}</span>
                </span>
              </label>
            ))}
            {query.hasNextPage && (
              <Button
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Load earlier instruction choices
              </Button>
            )}
            {!!selected?.some((id) => !turns.some((turn) => turn.id === id)) && (
              <p className="text-sm">
                The selection includes earlier turns. Load them here or inspect their full text in
                the complete input.
              </p>
            )}
          </details>
          <FormField label="Your next design instruction">
            <Textarea
              ref={composer}
              value={instruction}
              maxLength={8000}
              disabled={generate.isPending}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Describe the next layout adjustment…"
            />
          </FormField>
          <p className="text-sm text-muted-foreground">
            Pending proposals are absent from this saved base. Each response requires separate
            review.
          </p>
          <Failure error={graph.error} />
          <AiSelector value={ai} onChange={setAi} />
          <Failure error={preview.error} />
          <Failure error={generate.error} />
          {current?.configured ? (
            <Button variant="outline" disabled={blocked} onClick={() => preview.mutate(input)}>
              Review input
            </Button>
          ) : (
            <p role="status">
              AI generation is unavailable. Saved conversations, proposal review and manual editing
              remain available.
            </p>
          )}
          {reviewed && (
            <div className="space-y-4 rounded-sm border p-5">
              <h3 className="font-editorial text-2xl">Complete input for this turn</h3>
              <p>
                {reviewed.characters.toLocaleString()} of {reviewed.limit.toLocaleString()} UTF-16
                units.{" "}
                {reviewed.allowed
                  ? "Nothing is truncated."
                  : "Input exceeds the limit. Edit the instruction or deselect earlier instructions."}
              </p>
              <CodePayload
                label="Exact graph, fixtures and original instructions"
                value={reviewed.input}
              />
              <CodePayload label="Reviewed input digest" value={reviewed.digest} />
              {current?.configured && (
                <Button
                  disabled={!reviewed.allowed || blocked}
                  onClick={() =>
                    generate.mutate({ ...input, expectedInputDigest: reviewed.digest })
                  }
                >
                  Generate next proposal
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
      <aside className="min-w-0 space-y-5 self-start rounded-md border p-6">
        {inspectId ? (
          <TemplateAiInspection id={inspectId} onDraft={onDraft} onAccepted={() => {}} />
        ) : (
          <>
            <h2 className="font-editorial text-[28px]">
              {compareNewer ? "Selected and latest templates" : "Selected base"}
            </h2>
            <CodePayload
              label="Immutable graph identity"
              value={{ base, digest: saved.data?.revision.digest ?? null }}
            />
            <Failure error={newer.error} />
            {graph.graph &&
              (compareNewer && newer.data ? (
                <GraphView graph={newer.data.revision.graph} original={graph.graph} />
              ) : (
                <GraphView graph={graph.graph} />
              ))}
          </>
        )}
        {inspectId && (
          <Button variant="outline" onClick={() => setInspectId(null)}>
            Inspect selected base
          </Button>
        )}
      </aside>
    </div>
  );
}
