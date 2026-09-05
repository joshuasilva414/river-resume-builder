import type { EvidenceSelection, JobRequirement } from "@river/domain";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { JobResumes } from "~/components/composition/new-draft";
import { EvidenceDialog, Failure, FormField, selectClass } from "~/components/evidence/shared";
import { JobAiPanel } from "~/components/jobs/ai-panel";
import {
  type Choice,
  EvidenceSearchPanel,
  JobEvidenceInspector,
  SelectedEvidence,
} from "~/components/jobs/evidence-selection";
import { JobEditor } from "~/components/jobs/job-editor";
import { RequirementEditor } from "~/components/jobs/requirement-editor";
import {
  JobConflict,
  type JobDetail,
  type JobInput,
  useJobCommand,
  useJobDetail,
} from "~/components/jobs/shared";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";
export const Route = createFileRoute("/jobs_/$jobId")({
  validateSearch: (
    input: Record<string, unknown>,
  ): { snapshotId?: string; workspaceRevisionId?: string } => ({
    ...(typeof input.snapshotId === "string" ? { snapshotId: input.snapshotId } : {}),
    ...(typeof input.workspaceRevisionId === "string"
      ? { workspaceRevisionId: input.workspaceRevisionId }
      : {}),
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: JobPage,
});
type DialogState =
  | { type: "details" | "snapshot" | "archive"; detail: JobDetail }
  | { type: "requirement"; detail: JobDetail; requirement?: JobRequirement }
  | { type: "history" }
  | null;
function JobPage() {
  const session = Route.useRouteContext();
  const { jobId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const result = useJobDetail({ id: jobId, ...search });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [tab, setTab] = useState("requirements");
  const [view, setView] = useState("requirements");
  const [choosing, setChoosing] = useState<string | null>(null);
  const [association, setAssociation] = useState<string | null>(null);
  const [inspection, setInspection] = useState<EvidenceSelection | null>(null);
  const [pending, setPending] = useState<{ choice: Choice; input: JobInput } | null>(null);
  const [notice, setNotice] = useState("");
  const mutation = useJobCommand(() => {
    setPending(null);
    setNotice("Selection saved for this posting snapshot.");
  });
  const detail = result.data;
  const historical =
    detail &&
    (detail.snapshot.id !== detail.job.currentSnapshotId ||
      detail.workspace.id !== detail.currentWorkspaceRevisionId);
  const readOnly = Boolean(historical || detail?.job.archivedAt);
  const changeHistory = (snapshotId?: string, workspaceRevisionId?: string) => {
    setDialog(null);
    setChoosing(null);
    setAssociation(null);
    setNotice("");
    void navigate({
      search: {
        ...(snapshotId ? { snapshotId } : {}),
        ...(workspaceRevisionId ? { workspaceRevisionId } : {}),
      },
    });
  };
  const choose = (choice: Choice) => {
    if (!detail || readOnly || pending) return;
    const selection = {
      claimId: choice.selection.claimId,
      evidenceRevisionId: choice.selection.evidenceRevisionId,
      requirementId: choice.selection.requirementId,
    };
    const input: JobInput = {
      type: "selection",
      id: jobId,
      revision: detail.job.revision,
      snapshotId: detail.snapshot.id,
      selection,
      selected: choice.selected,
    };
    setPending({ choice, input });
    setNotice("");
    mutation.mutate(input);
  };
  const busy = Boolean(pending);
  return (
    <WorkspaceShell {...session}>
      <div className="p-5 md:px-7">
        <Button variant="link" className="px-0" asChild>
          <Link to="/jobs">
            <ArrowLeft />
            Job targets
          </Link>
        </Button>
        <Failure error={result.error} />
        {result.error && (
          <Button variant="outline" onClick={() => void result.refetch()}>
            Retry loading job
          </Button>
        )}
        {result.isPending && <p role="status">Loading job target…</p>}
      </div>
      {detail && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-5 border-b px-5 pb-6 md:px-7">
            <div className="min-w-0">
              <h1 className="page-heading break-words">{detail.job.details.role}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.job.details.company}
                {detail.job.details.location && ` · ${detail.job.details.location}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDialog({ type: "history" })}
              >
                Posting history
              </Button>
              {!detail.job.archivedAt && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDialog({ type: "details", detail })}
                >
                  Edit details
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setDialog({ type: "archive", detail })}
              >
                {detail.job.archivedAt ? "Restore job" : "Archive job"}
              </Button>
            </div>
          </header>
          {historical && (
            <Alert className="rounded-none border-x-0 border-t-0">
              <AlertDescription>
                This is a historical posting or tailoring revision. Current work is preserved.
                <Button variant="link" disabled={busy} onClick={() => changeHistory()}>
                  Return to current work
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {detail.job.archivedAt && (
            <p className="border-b bg-muted px-5 py-4 text-sm md:px-7">
              This job target is archived. Restore it to continue tailoring.
            </p>
          )}
          <JobResumes detail={detail} readOnly={readOnly} />
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <TabsList variant="line" className="mx-5 h-12 md:mx-7">
              <TabsTrigger value="requirements">Requirements & evidence</TabsTrigger>
              <TabsTrigger value="posting">Posting</TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="m-0 border-t">
              <div className="grid xl:grid-cols-[380px_minmax(0,1fr)]">
                <aside className="hidden border-r p-7 xl:block">
                  <Posting
                    detail={detail}
                    disabled={readOnly || busy}
                    onSnapshot={() => setDialog({ type: "snapshot", detail })}
                  />
                </aside>
                <section className="min-w-0 space-y-5 px-5 py-6 md:px-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-editorial text-[28px] leading-[34px]">
                      Requirements & evidence
                    </h2>
                    {!readOnly && (
                      <Button
                        disabled={busy}
                        onClick={() => setDialog({ type: "requirement", detail })}
                      >
                        <Plus />
                        Add requirement
                      </Button>
                    )}
                  </div>
                  <JobAiPanel
                    detail={detail}
                    readOnly={readOnly}
                    busy={busy}
                    onChoose={choose}
                    onManual={() => setView("all")}
                  />
                  <Tabs value={view} onValueChange={setView}>
                    <TabsList variant="line" className="h-12 max-w-full">
                      <TabsTrigger value="requirements">By requirement</TabsTrigger>
                      <TabsTrigger value="all">All evidence</TabsTrigger>
                      <TabsTrigger value="selected">Selected</TabsTrigger>
                    </TabsList>
                    <TabsContent value="requirements">
                      {!detail.workspace.data.requirements.length && (
                        <div className="space-y-3 border-y py-10">
                          <h3 className="font-editorial text-2xl">Define what the role needs.</h3>
                          <p className="max-w-lg text-sm text-muted-foreground">
                            Add qualifications and responsibilities from the posting. You can select
                            evidence manually throughout this workflow.
                          </p>
                        </div>
                      )}
                      {detail.workspace.data.requirements.map((requirement) => (
                        <article key={requirement.id} className="space-y-3 border-b py-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{requirement.priority}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {requirement.category}
                            </span>
                            {!readOnly && (
                              <Button
                                className="ml-auto"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  setDialog({ type: "requirement", detail, requirement })
                                }
                              >
                                Edit requirement
                              </Button>
                            )}
                          </div>
                          <h3 className="font-sans text-lg font-semibold leading-[26px] whitespace-pre-wrap">
                            {requirement.text}
                          </h3>
                          {requirement.keywords.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Keywords: {requirement.keywords.join(", ")}
                            </p>
                          )}
                          {requirement.confidence !== null && (
                            <p className="text-xs text-muted-foreground">
                              Interpretation confidence: {Math.round(requirement.confidence * 100)}%
                            </p>
                          )}
                          {requirement.passages.length ? (
                            <details>
                              <summary className="min-h-8 cursor-pointer text-sm text-primary">
                                View supporting passages
                              </summary>
                              {requirement.passages.map((p) => (
                                <blockquote
                                  key={`${p.start}:${p.end}`}
                                  className="my-3 border-l-2 pl-4 text-sm whitespace-pre-wrap"
                                >
                                  {p.quote}
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Line {detail.snapshot.text.slice(0, p.start).split("\n").length}{" "}
                                    · offsets {p.start}–{p.end}
                                  </p>
                                </blockquote>
                              ))}
                            </details>
                          ) : (
                            <p className="text-xs text-muted-foreground">No supporting passage</p>
                          )}
                          <SelectedEvidence
                            detail={detail}
                            requirementId={requirement.id}
                            readOnly={readOnly}
                            busy={busy}
                            onChoose={choose}
                            onInspect={setInspection}
                          />
                          {!readOnly && (
                            <Button
                              variant="outline"
                              onClick={() =>
                                setChoosing(choosing === requirement.id ? null : requirement.id)
                              }
                            >
                              {choosing === requirement.id
                                ? "Close evidence search"
                                : "Choose evidence"}
                            </Button>
                          )}
                          {choosing === requirement.id && (
                            <EvidenceSearchPanel
                              key={requirement.id}
                              detail={detail}
                              requirementId={requirement.id}
                              readOnly={readOnly}
                              busy={busy}
                              pending={pending?.choice ?? null}
                              onChoose={choose}
                              onInspect={setInspection}
                            />
                          )}
                        </article>
                      ))}
                    </TabsContent>
                    <TabsContent value="all" className="space-y-5 pt-5">
                      <FormField label="Select for">
                        <select
                          className={selectClass}
                          value={association ?? "general"}
                          onChange={(event) =>
                            setAssociation(
                              event.target.value === "general" ? null : event.target.value,
                            )
                          }
                        >
                          <option value="general">This job (general selection)</option>
                          {detail.workspace.data.requirements.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.text}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <p className="text-sm text-muted-foreground">
                        A general selection does not close an individual requirement's evidence gap.
                      </p>
                      <EvidenceSearchPanel
                        detail={detail}
                        requirementId={association}
                        readOnly={readOnly}
                        busy={busy}
                        pending={pending?.choice ?? null}
                        onChoose={choose}
                        onInspect={setInspection}
                      />
                    </TabsContent>
                    <TabsContent value="selected">
                      <SelectedEvidence
                        detail={detail}
                        readOnly={readOnly}
                        busy={busy}
                        onChoose={choose}
                        onInspect={setInspection}
                      />
                    </TabsContent>
                  </Tabs>
                </section>
              </div>
            </TabsContent>
            <TabsContent value="posting" className="m-0 border-t p-5 md:p-7">
              <div className="max-w-3xl">
                <Posting
                  detail={detail}
                  disabled={readOnly || busy}
                  onSnapshot={() => setDialog({ type: "snapshot", detail })}
                />
              </div>
            </TabsContent>
          </Tabs>
          {pending && (
            <div className="space-y-3 border-t px-5 py-4 md:px-7">
              <p role="status" className="text-sm">
                {mutation.isPending ? "Saving selection…" : "Selection not saved."}{" "}
                {pending.choice.selected ? "Select" : "Remove"}: {pending.choice.assertion}
              </p>
              <JobConflict
                error={mutation.error}
                id={jobId}
                local={
                  <p>
                    {pending.choice.selected ? "Select" : "Remove"}: {pending.choice.assertion}
                  </p>
                }
                onReload={() => {
                  setPending(null);
                  mutation.reset();
                  void result.refetch();
                }}
              />
              {mutation.isError && (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => mutation.mutate(pending.input)}>Retry save</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPending(null);
                      mutation.reset();
                      void result.refetch();
                    }}
                  >
                    Discard pending choice and reload selection
                  </Button>
                </div>
              )}
            </div>
          )}
          <footer className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-3 border-t bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-7">
            <Badge variant="secondary">
              {new Set(detail.selected.map((s) => s.claimId)).size}{" "}
              {new Set(detail.selected.map((s) => s.claimId)).size === 1 ? "claim" : "claims"}{" "}
              selected
            </Badge>
            <p className="text-xs text-muted-foreground" role="status">
              {pending
                ? mutation.isPending
                  ? "Saving…"
                  : "Unsaved selection"
                : result.error
                  ? "Showing last loaded work"
                  : notice || "Saved selection for this posting snapshot"}
            </p>
            <Button
              variant="link"
              className="ml-auto"
              onClick={() => {
                setTab("requirements");
                setView("selected");
              }}
            >
              Review selected evidence
            </Button>
          </footer>
          {dialog?.type === "history" && (
            <EvidenceDialog
              title="Posting history"
              description="Earlier postings and tailoring revisions remain available for inspection."
              onClose={() => setDialog(null)}
            >
              <div className="space-y-5">
                {detail.snapshots.map((snapshot) => (
                  <article key={snapshot.id} className="border-b pb-4">
                    <p className="font-medium">
                      {snapshot.details.role} · {snapshot.details.company}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(snapshot.createdAt).toLocaleString()}
                      {snapshot.id === detail.job.currentSnapshotId
                        ? " · Current posting"
                        : " · Earlier posting"}
                    </p>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => changeHistory(snapshot.id)}
                    >
                      Inspect posting and saved work
                    </Button>
                  </article>
                ))}
                <h3 className="font-sans text-sm font-semibold">
                  Requirements and selection history for the viewed posting
                </h3>
                {detail.history.map((revision, index) => (
                  <div
                    key={revision.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
                  >
                    <p className="text-sm">
                      {new Date(revision.createdAt).toLocaleString()}
                      {revision.id === detail.currentWorkspaceRevisionId ? " · Latest saved" : ""}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeHistory(detail.snapshot.id, revision.id)}
                    >
                      Inspect revision {detail.history.length - index}
                    </Button>
                  </div>
                ))}
              </div>
            </EvidenceDialog>
          )}
          {dialog &&
            dialog.type !== "history" &&
            (dialog.type === "requirement" ? (
              <RequirementEditor
                detail={dialog.detail}
                requirement={dialog.requirement}
                onClose={() => setDialog(null)}
              />
            ) : (
              <JobEditor
                mode={dialog.type}
                detail={dialog.detail}
                onClose={() => setDialog(null)}
                onSaved={() => {
                  if (dialog.type === "snapshot") changeHistory();
                }}
              />
            ))}
        </>
      )}
      {inspection && (
        <JobEvidenceInspector
          selection={inspection}
          readOnly={readOnly}
          busy={busy}
          onClose={() => setInspection(null)}
          onChoose={choose}
        />
      )}
    </WorkspaceShell>
  );
}
function Posting({
  detail,
  disabled,
  onSnapshot,
}: {
  detail: JobDetail;
  disabled: boolean;
  onSnapshot: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Saved posting</p>
        <h2 className="mt-3 font-editorial text-[22px] leading-7">
          {detail.snapshot.details.role}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail.snapshot.details.company} ·{" "}
          {new Date(detail.snapshot.createdAt).toLocaleDateString()}
        </p>
      </div>
      {detail.snapshot.url && (
        <a
          href={detail.snapshot.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all text-sm text-primary underline"
        >
          Original posting URL
        </a>
      )}
      <div className="max-h-[65dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-[22px]">
        {detail.snapshot.text}
      </div>
      <p className="text-xs text-muted-foreground">
        This posting is immutable. Capture a changed posting as a new snapshot.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer">Snapshot provenance</summary>
        <dl className="mt-3 space-y-2 break-all font-mono">
          <dt>Snapshot</dt>
          <dd>{detail.snapshot.id}</dd>
          <dt>Digest</dt>
          <dd>{detail.snapshot.digest}</dd>
          <dt>Captured by</dt>
          <dd>{detail.snapshot.actorId}</dd>
          <dt>Captured at</dt>
          <dd>{new Date(detail.snapshot.createdAt).toISOString()}</dd>
        </dl>
      </details>
      {!disabled && (
        <Button variant="outline" onClick={onSnapshot}>
          Add posting snapshot
        </Button>
      )}
    </div>
  );
}
