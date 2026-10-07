import {
  applyTemplate,
  blankGroup,
  blankValue,
  type ContentNode,
  mapContent,
  newIdentity,
  parseResume,
  type Resume,
  type VisualTemplate,
} from "@river/domain/workspace";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { inputClass, ValueInput } from "~/components/workspace/value-input";
import {
  getWorkspaceAnalyses,
  getWorkspaceScoringAllowance,
  requestWorkspaceScore,
} from "~/server/workspace-analysis-functions";
import type { WorkspaceScoreRequest } from "~/server/workspace-scoring";
import { type GeneratedPdf, usePdf } from "./pdf/use-pdf";
import {
  initialScoreFixtures,
  type ScoreFixture,
  scoreFixtureStorageSchema,
} from "./score-fixtures";
import { ScorecardResults } from "./scorecard-results";
import type { EditorController } from "./use-editor-controller";

function FixtureFields({
  node,
  template,
  onChange,
}: {
  node: ContentNode;
  template: VisualTemplate;
  onChange: (node: ContentNode) => void;
}) {
  if (node.kind === "field")
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium">{node.label}</p>
        <ValueInput value={node.value} onChange={(value) => onChange({ ...node, value })} />
      </div>
    );
  const definition = template.definitions.find((item) => item.id === node.definitionId);
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer text-sm">{node.label}</summary>
      <div className="mt-4 space-y-4">
        {node.children.map((child) => (
          <FixtureFields
            key={child.id}
            node={child}
            template={template}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((item) => (item.id === next.id ? next : item)),
              })
            }
          />
        ))}
        {definition?.fields
          .filter((field) => field.repeat)
          .map((field) => (
            <Button
              size="sm"
              variant="outline"
              key={field.id}
              onClick={() =>
                onChange({
                  ...node,
                  children: [
                    ...node.children,
                    field.type === "group" && field.definitionId
                      ? blankGroup(template, field.definitionId, field.key, field.label)
                      : {
                          kind: "field",
                          id: newIdentity(),
                          key: field.key,
                          label: field.label,
                          value: blankValue(field.type === "group" ? "text" : field.type),
                          factIds: [],
                        },
                  ],
                })
              }
            >
              Add fictional {field.label.toLowerCase()}
            </Button>
          ))}
      </div>
    </details>
  );
}
export function ScorePanel({
  id,
  ownerId,
  controller: c,
  onClose,
}: {
  id: string;
  ownerId: string;
  controller: EditorController;
  onClose: () => void;
}) {
  const templateMode = c.mode === "template",
    template = c.resume.template.document;
  const storageKey = `river.score-fixtures.v1.${ownerId}.${id}`;
  const [fixtures, setFixtures] = useState<ScoreFixture[]>(() =>
    initialScoreFixtures(template, id, c.draft.revision),
  );
  const [selected, setSelected] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [storageError, setStorageError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState<string | null>(null);
  const attempt = useRef<{ request: WorkspaceScoreRequest; key: string } | null>(null);
  useEffect(() => {
    if (templateMode)
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = scoreFixtureStorageSchema.parse(JSON.parse(raw));
          setFixtures(
            saved.fixtures.map((fixture) => ({
              ...fixture,
              resume: applyTemplate(parseResume(fixture.resume), {
                id,
                revision: c.draft.revision,
                document: template,
              }),
              mapped:
                JSON.stringify(fixture.resume.template.document) === JSON.stringify(template) &&
                fixture.mapped,
            })),
          );
        }
      } catch {
        setStorageError(
          "Saved fictional fixtures could not be restored. Fresh samples are shown; candidate data is unaffected.",
        );
      }
    setReady(true);
  }, [storageKey, templateMode, template, id, c.draft.revision]);
  useEffect(() => {
    if (ready && templateMode)
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, fixtures }));
      } catch {
        setStorageError(
          "Fictional fixture edits cannot be saved in this browser. Keep this tab open.",
        );
      }
  }, [fixtures, ready, storageKey, templateMode]);
  const resumePdf = usePdf(!templateMode ? c.resume : null);
  const first = usePdf(templateMode && ready ? (fixtures[0]?.resume ?? null) : null),
    second = usePdf(templateMode && ready ? (fixtures[1]?.resume ?? null) : null),
    third = usePdf(templateMode && ready ? (fixtures[2]?.resume ?? null) : null);
  const pdfs = templateMode ? [first, second, third] : [resumePdf];
  const analyses = useQuery({
    queryKey: ["workspace", "analyses", id],
    queryFn: async () => {
      const result = await getWorkspaceAnalyses({ data: id });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const allowance = useQuery({
    queryKey: ["workspace", "scoring-allowance"],
    queryFn: async () => {
      const result = await getWorkspaceScoringAllowance();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const key = JSON.stringify(templateMode ? fixtures : c.resume),
    stale = submitted !== null && submitted !== key;
  const updateFixture = (resume: Resume) => {
    setFixtures(
      fixtures.map((fixture, index) =>
        index === selected ? { ...fixture, resume, mapped: false } : fixture,
      ),
    );
    attempt.current = null;
  };
  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      const asSample = (pdf: GeneratedPdf, name: string) => ({
        name,
        resume: pdf.input,
        text: pdf.text,
        renderer: pdf.renderer,
        fonts: pdf.fonts,
        mapped: true as const,
      });
      const rendered = pdfs.map((pdf) => {
        if (!pdf.fresh || !pdf.result)
          throw Error("Wait for all current PDFs to pass the text check.");
        return pdf.result;
      });
      const single = rendered[0];
      if (!single) return;
      const input: WorkspaceScoreRequest = templateMode
        ? {
            documentId: id,
            idempotencyKey: newIdentity(),
            kind: "template-score",
            template,
            samples: rendered.map((pdf, index) =>
              asSample(pdf, fixtures[index]?.name ?? `Fictional sample ${index + 1}`),
            ),
          }
        : {
            documentId: id,
            idempotencyKey: newIdentity(),
            kind: "resume-score",
            sample: asSample(single, c.resume.name),
          };
      const frozen = attempt.current ?? { request: input, key };
      attempt.current = frozen;
      setSubmitted(frozen.key);
      const result = await requestWorkspaceScore({ data: frozen.request });
      if (!result.ok) throw Error(result.error.title);
      if (result.value.state === "Failed") {
        attempt.current = null;
        throw Error(result.value.error ?? "Scorecard failed. Export remains available.");
      }
      if (result.value.state === "Running")
        throw Error("This request is still running. Retry to read the retained result.");
      attempt.current = null;
      await analyses.refetch();
      await allowance.refetch();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to request scoring. Saving and export remain available.",
      );
      await analyses.refetch();
      await allowance.refetch();
    } finally {
      setBusy(false);
    }
  };
  const active = fixtures[selected];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl font-normal">
            {templateMode ? "Template" : "Résumé"} scorecard
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Optional feedback on submitted text. This does not assess PDF appearance or factual
          verification. Saving and exporting remain available if scoring fails.
        </p>
        {allowance.data && (
          <p className="text-xs text-muted-foreground">
            {allowance.data.exempt
              ? "Administrator scoring allowance"
              : `${allowance.data.remaining} of ${allowance.data.limit} results remaining · resets at midnight UTC`}
            .{" "}
            {templateMode
              ? "This scorecard uses three results."
              : "This scorecard uses one result."}
          </p>
        )}
        {storageError && (
          <p role="alert" className="text-xs text-amber-800">
            {storageError}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {stale && (
          <p role="status" className="text-xs text-amber-800">
            The document, fixtures, or job changed after submission. Retained results describe the
            earlier inputs.
          </p>
        )}
        {templateMode && active ? (
          <section className="space-y-4 rounded border p-4">
            <p className="text-xs uppercase text-primary">
              Three editable fictional résumé/job pairs
            </p>
            <p className="text-xs text-muted-foreground">
              Map or fill custom fields below. These samples stay in this browser and in scorecard
              history; they never enter the Fact Bank.
            </p>
            <div className="flex flex-wrap gap-2">
              {fixtures.map((fixture, index) => (
                <Button
                  key={fixture.id}
                  size="sm"
                  variant={selected === index ? "secondary" : "ghost"}
                  onClick={() => setSelected(index)}
                >
                  {fixture.name}
                </Button>
              ))}
            </div>
            <label className="block text-xs">
              Fictional job title
              <input
                className={`${inputClass} mt-1`}
                value={active.resume.job?.title ?? ""}
                onChange={(event) =>
                  updateFixture({
                    ...active.resume,
                    job: {
                      id: active.resume.job?.id ?? active.id,
                      title: event.target.value,
                      description: active.resume.job?.description ?? "",
                    },
                  })
                }
              />
            </label>
            <label className="block text-xs">
              Fictional job description
              <textarea
                className={`${inputClass} mt-1 min-h-28`}
                value={active.resume.job?.description ?? ""}
                onChange={(event) =>
                  updateFixture({
                    ...active.resume,
                    job: {
                      id: active.resume.job?.id ?? active.id,
                      title: active.resume.job?.title ?? "Fictional job",
                      description: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="max-h-80 space-y-2 overflow-auto">
              {active.resume.sections.map((node) => (
                <FixtureFields
                  key={node.id}
                  node={node}
                  template={template}
                  onChange={(next) =>
                    updateFixture({
                      ...active.resume,
                      sections: mapContent(active.resume.sections, node.id, () => next),
                    })
                  }
                />
              ))}
            </div>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={active.mapped}
                onChange={(event) => {
                  setFixtures(
                    fixtures.map((fixture) =>
                      fixture.id === active.id
                        ? { ...fixture, mapped: event.target.checked }
                        : fixture,
                    ),
                  );
                  attempt.current = null;
                }}
              />
              <span>
                I reviewed this sample's field values and job. Empty fields are intentional.
              </span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFixtures(initialScoreFixtures(template, id, c.draft.revision));
                attempt.current = null;
              }}
            >
              Reset fictional samples
            </Button>
          </section>
        ) : (
          <p className="text-sm">
            {c.resume.job
              ? `Captured job: ${c.resume.job.title}`
              : "Select a job target in the editor before scoring."}
          </p>
        )}
        <div className="space-y-2">
          {pdfs.map((pdf, index) => (
            <p
              key={templateMode ? fixtures[index]?.id : id}
              role="status"
              className="text-xs text-muted-foreground"
            >
              {templateMode ? `${fixtures[index]?.name}: ` : ""}
              {pdf.pending
                ? "Rendering and checking complete text…"
                : (pdf.error ??
                  (pdf.fresh
                    ? `${pdf.result?.text.length ?? 0}/6,000 résumé characters · PDF text check passed`
                    : "Waiting for current PDF…"))}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            Each captured job description must be within 4,000 characters. River does not truncate
            scoring inputs.
          </p>
        </div>
        <Button
          disabled={
            busy ||
            pdfs.some((pdf) => !pdf.fresh) ||
            (templateMode ? fixtures.some((fixture) => !fixture.mapped) : !c.resume.job)
          }
          onClick={() => void launch()}
        >
          {busy
            ? "Requesting scorecard…"
            : attempt.current
              ? "Retry captured request"
              : "Request scorecard"}
        </Button>
        {attempt.current && !busy && (
          <Button
            variant="ghost"
            onClick={() => {
              attempt.current = null;
              setError(null);
            }}
          >
            Use current inputs instead
          </Button>
        )}
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-serif text-2xl font-normal">Retained scorecards</h3>
          {analyses.data
            ?.filter((run) => run.kind === (templateMode ? "template-score" : "resume-score"))
            .map((run) => (
              <details key={run.id} className="rounded border p-4" open>
                <summary className="cursor-pointer text-sm">
                  {new Date(run.createdAt).toLocaleString()} · {run.state}
                </summary>
                <div className="mt-4 space-y-4">
                  {run.error && <p className="text-sm text-destructive">{run.error}</p>}
                  {run.result && <ScorecardResults result={run.result} />}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Captured inputs and rendering metadata
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {run.input}
                      {"\n"}
                      {run.metadata}
                    </pre>
                  </details>
                </div>
              </details>
            ))}
          {!analyses.data?.some((run) => run.kind.endsWith("-score")) && (
            <p className="text-sm text-muted-foreground">No scorecards saved yet.</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
