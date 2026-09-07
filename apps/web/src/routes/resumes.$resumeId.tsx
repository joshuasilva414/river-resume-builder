import {
  type BlockPlacement,
  blockDefinitions,
  type Composition,
  type ContentPlacement,
  type ContentType,
  contentValue,
  placeBlock,
  placeContent,
  placeSection,
  type SectionPlacement,
  undoAcceptedWording,
} from "@river/domain";
import type { TemplateBase } from "@river/templates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useBlocker } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Redo2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { CaptureCheckpoint, CheckpointHistory } from "~/components/composition/checkpoints";
import { CopyDialog } from "~/components/composition/copy";
import { DraftPreview } from "~/components/composition/preview";
import { type PlacementPath, ReuseDialog } from "~/components/composition/reuse";
import { type ResumeDetail, useDraft, useResume } from "~/components/composition/use-draft";
import { CompositionView } from "~/components/composition/view";
import { useWordingAssistance } from "~/components/composition/wording-ai";
import { WordingEditor } from "~/components/composition/wording-editor";
import {
  EvidenceDialog,
  Failure,
  FormField,
  RequestFailure,
  unwrap,
} from "~/components/evidence/shared";
import { LibraryEditor } from "~/components/library/editor";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { LibraryPicker } from "~/components/library/picker";
import type { LibraryNode } from "~/components/library/shared";
import { BindingInspection, compositionBase, TemplateLayout } from "~/components/templates/binding";
import { BasePicker, useTemplateBase } from "~/components/templates/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { WorkspaceShell } from "~/components/workspace-shell";
import { forkResume, getResume } from "~/server/composition-functions";
import { getSession } from "~/server/functions";
import { getLibraryDetail } from "~/server/library-functions";
export const Route = createFileRoute("/resumes/$resumeId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: ResumePage,
});
function ResumePage() {
  const session = Route.useRouteContext(),
    { resumeId } = Route.useParams(),
    result = useResume(resumeId);
  return (
    <WorkspaceShell {...session} contained>
      <Failure error={result.error} />
      {result.isPending && (
        <p className="p-8" role="status">
          Loading résumé…
        </p>
      )}
      {result.error && <Button onClick={() => void result.refetch()}>Retry draft</Button>}
      {result.data && <Editor key={resumeId} detail={result.data} />}
    </WorkspaceShell>
  );
}
type Destination =
  | { kind: "section"; type: null }
  | { kind: "block"; type: ContentType; sectionId: string }
  | { kind: "content"; type: ContentType; sectionId: string; blockId: string; field: string };
function Editor({ detail }: { detail: ResumeDetail }) {
  const navigationAllowed = useRef(false);
  const [copy, setCopy] = useState<PlacementPath | null>(null);
  const [reuse, setReuse] = useState<PlacementPath | null>(null);
  const session = useDraft(detail),
    navigate = Route.useNavigate(),
    client = useQueryClient();
  const [graph, setGraph] = useState<readonly LibraryNode[]>(detail.graph),
    [picker, setPicker] = useState<Destination | null>(null),
    [creating, setCreating] = useState<Destination | null>(null);
  const [wording, setWording] = useState<{
      sectionId: string;
      blockId: string;
      content: ContentPlacement;
    } | null>(null),
    [history, setHistory] = useState(false),
    [review, setReview] = useState(false),
    [compare, setCompare] = useState(false),
    [inspect, setInspect] = useState<ContentPlacement | null>(null);
  const [branchTemplate, setBranchTemplate] = useState<TemplateBase | null>(null);
  const branchBase = branchTemplate ?? compositionBase(session.data);
  const branchGraph = useTemplateBase(branchBase);
  const branchEligible =
    branchBase.kind === "fixed" || branchGraph.data?.revision.state === "Approved";
  const [branchRequest, setBranchRequest] = useState<{
    id: string;
    revision: number;
    data: Composition;
    idempotencyKey: string;
  } | null>(null);
  const branch = useMutation({
    mutationFn: async () => {
      if (!branchGraph.graph || !branchEligible)
        throw new Error("Choose an Approved template for the new branch.");
      const { template: _previous, ...branchData } = session.data;
      const request = branchRequest ?? {
        id: detail.draft.id,
        revision: session.ack.revision,
        data: {
          ...branchData,
          theme: branchGraph.graph.theme,
          ...(branchBase.kind === "saved" && branchGraph.data
            ? {
                template: {
                  designId: branchGraph.data.design.id,
                  revisionId: branchBase.revisionId,
                },
              }
            : {}),
        },
        idempotencyKey: crypto.randomUUID(),
      };
      setBranchRequest(request);
      return unwrap(await forkResume({ data: request }));
    },
    onSuccess: (outcome) => {
      navigationAllowed.current = true;
      void client.invalidateQueries({ queryKey: ["resumes"] });
      void navigate({ to: "/resumes/$resumeId", params: { resumeId: outcome.id } });
    },
  });
  useBlocker({
    disabled: (!session.dirty && !session.pending) || branch.isSuccess,
    shouldBlockFn: () =>
      navigationAllowed.current
        ? false
        : !window.confirm("Leave this draft and discard unsaved changes in this tab?"),
    enableBeforeUnload: true,
  });
  const mergedGraph = [
    ...new Map([...graph, ...detail.graph].map((node) => [node.revision.id, node])).values(),
  ];
  const change = (data: Composition) => {
    session.clearValidation();
    session.change(data);
  };
  const changeSection = (next: SectionPlacement) =>
    change({
      ...session.data,
      sections: session.data.sections.map((section) => (section.id === next.id ? next : section)),
    });
  const changeBlock = (sectionId: string, next: BlockPlacement) => {
    const section = session.data.sections.find((section) => section.id === sectionId);
    if (section)
      changeSection({
        ...section,
        blocks: section.blocks.map((block) => (block.id === next.id ? next : block)),
      });
  };
  const applyContent = (sectionId: string, blockId: string, content: ContentPlacement) => {
    const block = session.data.sections
      .find((section) => section.id === sectionId)
      ?.blocks.find((block) => block.id === blockId);
    if (block)
      changeBlock(sectionId, {
        ...block,
        fields: block.fields.map((field) => ({
          ...field,
          contents: field.contents.map((item) => (item.id === content.id ? content : item)),
        })),
      });
  };
  const insert = (
    destination: Destination,
    selected: ResumeDetail["graph"][number],
    nodes: readonly LibraryNode[],
  ) => {
    const reference = { itemId: selected.item.id, revisionId: selected.revision.id };
    setGraph([...mergedGraph, ...nodes]);
    if (destination.kind === "section") {
      const section = placeSection(reference, nodes);
      change({
        ...session.data,
        sections:
          section.type === "contact"
            ? [section, ...session.data.sections]
            : [...session.data.sections, section],
      });
    } else {
      const section = session.data.sections.find((section) => section.id === destination.sectionId);
      if (!section) return;
      if (destination.kind === "block")
        changeSection({
          ...section,
          reason: "Added a Block for this résumé.",
          blocks: [...section.blocks, placeBlock(reference, nodes)],
        });
      else {
        const block = section.blocks.find((block) => block.id === destination.blockId);
        if (!block) return;
        const definition = blockDefinitions[block.type].fields.find(
          (field) => field.key === destination.field,
        );
        if (!definition) return;
        changeBlock(section.id, {
          ...block,
          reason: "Changed a wording binding for this résumé.",
          fields: blockDefinitions[block.type].fields.map((field) => ({
            key: field.key,
            contents:
              field.key === destination.field
                ? definition.max === 1
                  ? [placeContent(reference)]
                  : [
                      ...(block.fields.find((value) => value.key === field.key)?.contents ?? []),
                      placeContent(reference),
                    ]
                : (block.fields.find((value) => value.key === field.key)?.contents ?? []),
          })),
        });
      }
    }
  };
  const outdated = detail.draft.revision > session.ack.revision && !session.pending;
  const conflict =
    session.error instanceof RequestFailure && session.error.problem.code === "Conflict";
  const status = session.pending
    ? "Saving…"
    : conflict
      ? "Conflict · autosave paused"
      : session.error
        ? "Save failed"
        : session.dirty
          ? "Unsaved changes"
          : `Saved · revision ${session.ack.revision}`;
  const shift = <T,>(values: readonly T[], index: number, direction: number) => {
    const next = [...values],
      value = next[index];
    if (value === undefined || index + direction < 0 || index + direction >= next.length)
      return values;
    next.splice(index, 1);
    next.splice(index + direction, 0, value);
    return next;
  };
  const assistance = useWordingAssistance(
    detail,
    session.dirty || session.pending || !!session.error || outdated,
    (path) => {
      const content = session.data.sections
        .find((section) => section.id === path.sectionId)
        ?.blocks.find((block) => block.id === path.blockId)
        ?.fields.flatMap((field) => field.contents)
        .find((content) => content.id === path.contentId);
      if (content) setWording({ sectionId: path.sectionId, blockId: path.blockId, content });
    },
    (input, proposal, perform) =>
      session.applyExternalEdit(async () => {
        const id = await perform();
        const current = unwrap(await getResume({ data: { id: detail.draft.id } }));
        setGraph(current.graph);
        return {
          id,
          detail: current,
          undo: undoAcceptedWording(current.draft.data, current.graph, input.target, proposal),
        };
      }),
  );
  return (
    <>
      <header className="shrink-0 space-y-3 border-b px-5 py-7 md:px-8">
        <Link
          to="/jobs/$jobId"
          params={{ jobId: detail.draft.jobId }}
          className="eyebrow text-primary"
        >
          {detail.snapshot.details.company} / {detail.snapshot.details.role}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="page-heading">{session.data.name}</h1>
          <Button variant="outline" onClick={() => setReview(true)}>
            Review draft
          </Button>
          <Button variant="outline" onClick={() => setHistory(true)}>
            History
          </Button>
          {assistance.queueButton}
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
        {(session.error || outdated) && (
          <div className="space-y-3">
            <Failure error={session.error} />
            <p className="text-sm">
              {outdated ? "A newer saved draft is available. " : ""}Pending edits exist only in this
              tab. Keep it open until saving or recovery completes.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setCompare(true);
                void client.invalidateQueries({ queryKey: ["resumes", "detail", detail.draft.id] });
              }}
            >
              Compare local and saved drafts
            </Button>
            {!conflict && (
              <Button variant="outline" onClick={() => void session.send()}>
                Retry save
              </Button>
            )}
          </div>
        )}
      </header>
      <div className="border-b p-5 text-sm lg:hidden">
        Composition editing is available on a larger screen. Review the saved draft and its PDF
        here.
      </div>
      <div className="grid flex-1 xl:min-h-0 xl:overflow-hidden xl:grid-cols-[minmax(0,660fr)_minmax(0,576fr)]">
        <section className="hidden min-w-0 border-r lg:block xl:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3 border-b p-6">
            <h2 className="font-sans font-semibold">Content</h2>
            <Button
              variant="outline"
              disabled={!session.canUndo || session.pending}
              onClick={session.undo}
            >
              <Undo2 />
              Undo
            </Button>
            <Button
              variant="outline"
              disabled={!session.canRedo || session.pending}
              onClick={session.redo}
            >
              <Redo2 />
              Redo
            </Button>
            <Button variant="outline" onClick={() => setPicker({ kind: "section", type: null })}>
              Choose library section
            </Button>
            <Button variant="outline" onClick={() => setCreating({ kind: "section", type: null })}>
              Create section
            </Button>
          </div>
          <div className="space-y-6 p-6">
            <FormField label="Draft name">
              <Input
                value={session.data.name}
                maxLength={160}
                onChange={(event) => change({ ...session.data, name: event.target.value })}
              />
            </FormField>
            {!session.data.sections.length && (
              <div className="space-y-3 py-8">
                <h2 className="font-editorial text-2xl">Add your first section.</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a saved section or create one. Start with your contact details so the PDF
                  can include your name.
                </p>
              </div>
            )}
            {session.data.sections.map((section, index) => (
              <section key={section.id} className="space-y-4 border-t pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-editorial text-2xl">
                    {section.heading || "Contact / header"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${section.heading || "header"} up`}
                    disabled={
                      index === 0 ||
                      section.type === "contact" ||
                      session.data.sections[index - 1]?.type === "contact"
                    }
                    onClick={() =>
                      change({ ...session.data, sections: shift(session.data.sections, index, -1) })
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${section.heading || "header"} down`}
                    disabled={
                      section.type === "contact" || index === session.data.sections.length - 1
                    }
                    onClick={() =>
                      change({ ...session.data, sections: shift(session.data.sections, index, 1) })
                    }
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      change({
                        ...session.data,
                        sections: session.data.sections.filter((value) => value.id !== section.id),
                      })
                    }
                  >
                    Remove section
                  </Button>
                  <Button
                    variant="outline"
                    disabled={session.dirty || session.pending || outdated}
                    onClick={() =>
                      setReuse({ sectionId: section.id, blockId: null, contentId: null })
                    }
                  >
                    Inspect section reuse
                  </Button>
                  <Button
                    variant="outline"
                    disabled={session.dirty || session.pending || outdated}
                    onClick={() =>
                      setCopy({ sectionId: section.id, blockId: null, contentId: null })
                    }
                  >
                    Copy section
                  </Button>
                </div>
                <p className="eyebrow">
                  {section.reason ? "Changed for this résumé" : "Saved from your library"}
                </p>
                {section.type !== "contact" && (
                  <FormField label="Printed section heading">
                    <Input
                      value={section.heading}
                      maxLength={120}
                      onChange={(event) =>
                        changeSection({
                          ...section,
                          heading: event.target.value,
                          reason: "Changed the printed Section heading.",
                        })
                      }
                    />
                  </FormField>
                )}
                {section.blocks.map((block, blockIndex) => (
                  <article key={block.id} className="space-y-4 rounded-sm border p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-sans text-base font-semibold">
                        {blockDefinitions[block.type].label}
                      </h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move entry ${blockIndex + 1} up`}
                        disabled={blockIndex === 0}
                        onClick={() =>
                          changeSection({
                            ...section,
                            reason: "Reordered Blocks for this résumé.",
                            blocks: shift(section.blocks, blockIndex, -1),
                          })
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move entry ${blockIndex + 1} down`}
                        disabled={blockIndex === section.blocks.length - 1}
                        onClick={() =>
                          changeSection({
                            ...section,
                            reason: "Reordered Blocks for this résumé.",
                            blocks: shift(section.blocks, blockIndex, 1),
                          })
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          changeSection({
                            ...section,
                            reason: "Removed a Block from this résumé.",
                            blocks: section.blocks.filter((value) => value.id !== block.id),
                          })
                        }
                      >
                        Remove entry
                      </Button>
                      <Button
                        variant="outline"
                        disabled={session.dirty || session.pending || outdated}
                        onClick={() =>
                          setReuse({ sectionId: section.id, blockId: block.id, contentId: null })
                        }
                      >
                        Inspect entry reuse
                      </Button>
                      <Button
                        variant="outline"
                        disabled={session.dirty || session.pending || outdated}
                        onClick={() =>
                          setCopy({ sectionId: section.id, blockId: block.id, contentId: null })
                        }
                      >
                        Copy entry
                      </Button>
                    </div>
                    {block.reason && (
                      <p className="text-xs text-primary">Local composition · {block.reason}</p>
                    )}
                    {blockDefinitions[block.type].fields.map((field) => {
                      const contents =
                        block.fields.find((value) => value.key === field.key)?.contents ?? [];
                      return (
                        <section key={field.key} className="space-y-3">
                          <h4 className="font-sans text-sm font-semibold">{field.label}</h4>
                          {contents.map((content, contentIndex) => {
                            const value = contentValue(content, mergedGraph);
                            return (
                              <div
                                key={content.id}
                                className={`space-y-3 border-l-2 pl-3 ${assistance.path?.contentId === content.id ? "border-primary" : ""}`}
                              >
                                {assistance.path?.contentId === content.id && (
                                  <p className="eyebrow text-primary">Selected wording placement</p>
                                )}
                                <p className="whitespace-pre-wrap text-[15px] leading-6 break-words">
                                  {value.wording}
                                </p>
                                <p className="eyebrow">
                                  {content.override ? "Wording changed here" : "Saved wording"} ·{" "}
                                  {value.evidence.length} evidence links
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      setWording({
                                        sectionId: section.id,
                                        blockId: block.id,
                                        content,
                                      })
                                    }
                                  >
                                    Edit wording
                                  </Button>
                                  {assistance.configured && (
                                    <Button
                                      variant="outline"
                                      disabled={
                                        session.dirty ||
                                        session.pending ||
                                        !!session.error ||
                                        outdated
                                      }
                                      onClick={() =>
                                        assistance.launch({
                                          sectionId: section.id,
                                          blockId: block.id,
                                          contentId: content.id,
                                        })
                                      }
                                    >
                                      Suggest wording
                                    </Button>
                                  )}
                                  <Button variant="ghost" onClick={() => setInspect(content)}>
                                    Inspect evidence
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    disabled={session.dirty || session.pending || outdated}
                                    onClick={() =>
                                      setReuse({
                                        sectionId: section.id,
                                        blockId: block.id,
                                        contentId: content.id,
                                      })
                                    }
                                  >
                                    Inspect wording reuse
                                  </Button>
                                  {contents.length > 1 && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Move ${field.label} item ${contentIndex + 1} up`}
                                        disabled={contentIndex === 0}
                                        onClick={() =>
                                          changeBlock(section.id, {
                                            ...block,
                                            reason: "Reordered wording for this résumé.",
                                            fields: block.fields.map((item) =>
                                              item.key === field.key
                                                ? {
                                                    ...item,
                                                    contents: shift(contents, contentIndex, -1),
                                                  }
                                                : item,
                                            ),
                                          })
                                        }
                                      >
                                        <ArrowUp />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Move ${field.label} item ${contentIndex + 1} down`}
                                        disabled={contentIndex === contents.length - 1}
                                        onClick={() =>
                                          changeBlock(section.id, {
                                            ...block,
                                            reason: "Reordered wording for this résumé.",
                                            fields: block.fields.map((item) =>
                                              item.key === field.key
                                                ? {
                                                    ...item,
                                                    contents: shift(contents, contentIndex, 1),
                                                  }
                                                : item,
                                            ),
                                          })
                                        }
                                      >
                                        <ArrowDown />
                                      </Button>
                                    </>
                                  )}
                                  {contents.length > field.min && (
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        changeBlock(section.id, {
                                          ...block,
                                          reason: "Removed a wording binding.",
                                          fields: block.fields.map((item) =>
                                            item.key === field.key
                                              ? {
                                                  ...item,
                                                  contents: contents.filter(
                                                    (value) => value.id !== content.id,
                                                  ),
                                                }
                                              : item,
                                          ),
                                        })
                                      }
                                    >
                                      Remove wording
                                    </Button>
                                  )}
                                </div>
                                {assistance.inlineFor({
                                  sectionId: section.id,
                                  blockId: block.id,
                                  contentId: content.id,
                                })}
                              </div>
                            );
                          })}
                          {(contents.length < field.max || field.max === 1) && (
                            <Button
                              variant="outline"
                              onClick={() =>
                                setPicker({
                                  kind: "content",
                                  type: block.type,
                                  sectionId: section.id,
                                  blockId: block.id,
                                  field: field.key,
                                })
                              }
                            >
                              {field.max === 1 && contents.length
                                ? "Replace from library"
                                : "Add wording"}
                            </Button>
                          )}
                        </section>
                      );
                    })}
                  </article>
                ))}
                {(section.type !== "contact" || !section.blocks.length) && (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPicker({ kind: "block", type: section.type, sectionId: section.id })
                      }
                    >
                      Add entry
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCreating({ kind: "block", type: section.type, sectionId: section.id })
                      }
                    >
                      Create reusable entry
                    </Button>
                  </div>
                )}
              </section>
            ))}
            <TemplateLayout
              detail={detail}
              waiting={
                session.dirty ||
                session.pending ||
                Boolean(session.error) ||
                session.ack.revision !== detail.draft.revision
              }
            />
          </div>
        </section>
        <div className="space-y-6 p-5 lg:hidden">
          <CompositionView data={detail.draft.data} graph={detail.graph} provenance />
        </div>
        <div className={assistance.panel ? "hidden" : "contents"}>
          <DraftPreview
            detail={detail}
            revision={session.ack.revision}
            dirty={session.dirty || session.pending}
          />
        </div>
        {assistance.panel && (
          <aside className="min-w-0 space-y-5 bg-muted/60 p-6 xl:overflow-y-auto">
            {assistance.panel}
          </aside>
        )}
      </div>
      {copy && <CopyDialog detail={detail} path={copy} onClose={() => setCopy(null)} />}
      {reuse && (
        <ReuseDialog
          detail={detail}
          path={reuse}
          onClose={() => setReuse(null)}
          onApplied={async () => {
            await client.invalidateQueries({ queryKey: ["resumes", "detail", detail.draft.id] });
            const current = client.getQueryData<ResumeDetail>([
              "resumes",
              "detail",
              detail.draft.id,
            ]);
            if (current) {
              session.reload(current);
              setGraph(current.graph);
            }
          }}
        />
      )}
      {picker && (
        <LibraryPicker
          kind={picker.kind}
          type={picker.type}
          onClose={() => setPicker(null)}
          onPick={(reference, selected) => {
            const node = selected.graph.find((node) => node.revision.id === reference.revisionId);
            if (node) insert(picker, node, selected.graph);
            setPicker(null);
          }}
        />
      )}
      {creating && (
        <LibraryEditor
          kind={creating.kind}
          initialType={creating.type ?? "contact"}
          onClose={() => setCreating(null)}
          onSaved={(reference) => {
            const destination = creating;
            void getLibraryDetail({
              data: { id: reference.itemId, revisionId: reference.revisionId },
            })
              .then(unwrap)
              .then((detail) => {
                const node = detail.graph.find((node) => node.revision.id === reference.revisionId);
                if (node) insert(destination, node, detail.graph);
              })
              .catch(() => setPicker(destination));
          }}
        />
      )}
      {assistance.dialogs}
      {wording && (
        <WordingEditor
          content={wording.content}
          graph={mergedGraph}
          onClose={() => setWording(null)}
          onApply={(content) => applyContent(wording.sectionId, wording.blockId, content)}
        />
      )}
      {inspect && (
        <EvidenceDialog
          title="Wording provenance"
          description="This wording is pinned to the listed evidence revisions."
          onClose={() => setInspect(null)}
          wide
        >
          <p className="mb-5 whitespace-pre-wrap">{contentValue(inspect, mergedGraph).wording}</p>
          <EvidenceLinks value={contentValue(inspect, mergedGraph).evidence} />
        </EvidenceDialog>
      )}
      {history && <CheckpointHistory draftId={detail.draft.id} onClose={() => setHistory(false)} />}
      {review && (
        <EvidenceDialog
          title="Review résumé draft"
          description={
            session.dirty
              ? "This is your visible draft, including unsaved edits. Export review follows the saved checkpoint workflow."
              : `Saved revision ${session.ack.revision}. Inspect complete wording and evidence.`
          }
          onClose={() => setReview(false)}
          wide
        >
          <CompositionView data={session.data} graph={mergedGraph} provenance />
          <CaptureCheckpoint
            key={`${detail.draft.id}:${session.ack.revision}`}
            id={detail.draft.id}
            revision={session.ack.revision}
            waiting={session.dirty || session.pending || !!session.error || outdated}
          />
        </EvidenceDialog>
      )}
      {compare && (
        <EvidenceDialog
          title="Compare local and saved drafts"
          description="Autosave recovery keeps your local composition in this tab. Reload explicitly discards the local version shown here."
          onClose={() => setCompare(false)}
          wide
          pending={branch.isPending}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4">
              <p className="eyebrow">Your local draft · based on revision {session.ack.revision}</p>
              <CompositionView data={session.data} graph={mergedGraph} provenance />
            </section>
            <section className="space-y-4">
              <p className="eyebrow">Saved revision {detail.draft.revision}</p>
              <CompositionView data={detail.draft.data} graph={detail.graph} provenance />
            </section>
          </div>
          {session.data.template && (
            <div className="mt-6 space-y-4 border-t pt-5">
              <BasePicker
                label="Template for preserved branch"
                value={branchBase}
                approvedOnly
                onChange={(base) => {
                  setBranchTemplate(base);
                  setBranchRequest(null);
                  branch.reset();
                }}
                disabled={branch.isPending}
              />
              <BindingInspection base={branchBase} />
              {!branchEligible && branchGraph.data && (
                <p className="text-sm text-muted-foreground">
                  The current template is unavailable for a new binding. Select an Approved
                  replacement to preserve the local wording and composition in a new branch.
                </p>
              )}
            </div>
          )}
          <Failure error={branch.error} />
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button
              disabled={branch.isPending || !branchGraph.graph || !branchEligible}
              onClick={() => branch.mutate()}
            >
              {branch.error ? "Retry creating branch" : "Keep my edits as a new branch"}
            </Button>
            <Button
              disabled={session.pending || branch.isPending}
              variant="outline"
              onClick={() => {
                session.reload(detail);
                setGraph(detail.graph);
                setCompare(false);
              }}
            >
              Discard local edits and reload saved draft
            </Button>
          </div>
        </EvidenceDialog>
      )}
    </>
  );
}
