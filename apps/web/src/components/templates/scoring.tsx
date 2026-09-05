import type { StartTemplateScoringRequest } from "@river/contracts";
import type { TemplateBase } from "@river/templates";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { SavedText, ScoreDimensions } from "~/components/scoring/review";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cancelDocumentOperation } from "~/server/functions";
import {
  getTemplateScoringRun,
  getTemplateScoringRuns,
  retryTemplateScoringRun,
  scoreTemplateFixtures,
} from "~/server/template-scoring-functions";
import { baseKey, CodePayload, useTemplateCommand } from "./shared";

export function TemplateScoring({
  base,
  reviewRevision,
  eligible,
}: {
  base: TemplateBase;
  reviewRevision: number | null;
  eligible: boolean;
}) {
  const client = useQueryClient(),
    request = useRef<StartTemplateScoringRequest | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["templates", "scoring", baseKey(base)],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getTemplateScoringRuns({ data: { base, offset: pageParam } })),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 20 : undefined),
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((r) => ["Pending", "Running"].includes(r.state)))
        ? 2000
        : false,
  });
  const history = query.data?.pages.flatMap((p) => p.items) ?? [],
    settings = query.data?.pages[0],
    active = history.some((r) => ["Pending", "Running"].includes(r.state));
  const start = useMutation({
    mutationFn: async () => {
      if (
        !request.current ||
        request.current.reviewRevision !== reviewRevision ||
        baseKey(request.current.base) !== baseKey(base)
      )
        request.current = { base, reviewRevision, idempotencyKey: crypto.randomUUID() };
      return unwrap(await scoreTemplateFixtures({ data: request.current }));
    },
    onSuccess: async (result) => {
      request.current = null;
      setSelected(result.id);
      await client.invalidateQueries({ queryKey: ["templates", "scoring"] });
    },
  });
  return (
    <section className="space-y-[18px] rounded-md border bg-card p-6">
      <h3 className="font-editorial text-xl font-semibold">Template scoring</h3>
      <p className="text-sm leading-5 text-muted-foreground">
        Every canonical synthetic fixture must pass all six simulations. Results apply to this exact
        template and fixture set.
      </p>
      <Failure error={query.error ?? start.error} />
      {query.isPending && <p role="status">Loading qualification history…</p>}
      {settings && (
        <>
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {settings.fixtureSet.version} · {settings.fixtureSet.fixtures.length} required fixtures
          </p>
          {!settings.configured && (
            <p role="status" className="text-sm">
              Scoring is unavailable. Local validation and export remain available.
            </p>
          )}
          {!eligible && (
            <p className="text-sm">
              An exact Validated or Approved revision is required to start scoring.
            </p>
          )}
          {settings.configured && eligible && (
            <Button disabled={start.isPending || active} onClick={() => start.mutate()}>
              {start.isPending || active ? "Scoring in progress" : "Score fixtures"}
            </Button>
          )}
        </>
      )}
      {settings && !history.length && (
        <p className="text-sm text-muted-foreground">
          No qualification report. Designation withheld.
        </p>
      )}
      {history.map((run) => {
        const current =
          run.report?.fixtureSetDigest === settings?.fixtureSet.digest &&
          run.report?.policy === settings?.policy;
        return (
          <button
            type="button"
            key={run.id}
            className="block w-full space-y-2 border-t pt-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => setSelected(run.id)}
          >
            <Badge
              variant="outline"
              className={
                run.report?.qualified && current
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : ""
              }
            >
              {run.report?.qualified
                ? current
                  ? "ATS Screener tested"
                  : "Historical qualification"
                : ["Pending", "Running"].includes(run.state)
                  ? "Testing incomplete"
                  : "Designation withheld"}
            </Badge>
            <span className="block text-xs text-muted-foreground">
              {new Date(run.createdAt).toLocaleString()} · {run.state} · attempt {run.attempts}/3
            </span>
            <span className="block text-sm font-semibold">Open fixture results</span>
          </button>
        );
      })}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load earlier results
        </Button>
      )}
      {selected && (
        <TemplateScoringReview
          id={selected}
          runtimeConfigured={settings?.runtimeConfigured ?? false}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
function TemplateScoringReview({
  id,
  runtimeConfigured,
  onClose,
}: {
  id: string;
  runtimeConfigured: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    [selectedAttempt, setSelectedAttempt] = useState<string | null>(null),
    [pdf, setPdf] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["templates", "scoring", "run", id],
    queryFn: async () => unwrap(await getTemplateScoringRun({ data: { id } })),
    refetchInterval: (q) =>
      q.state.data && ["Pending", "Running"].includes(q.state.data.operation.state) ? 2000 : false,
  });
  useEffect(() => {
    if (query.data && selectedAttempt === null) setSelectedAttempt(query.data.operation.id);
  }, [query.data, selectedAttempt]);
  const detail = query.data,
    active = Boolean(detail && ["Pending", "Running"].includes(detail.operation.state));
  const retry = useTemplateCommand(
    async (input: { id: string; revision: number }, key) =>
      unwrap(await retryTemplateScoringRun({ data: { ...input, idempotencyKey: key } })),
    (result) => setSelectedAttempt(result.revisionId ?? null),
  );
  const cancel = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("No active run");
      return unwrap(
        await cancelDocumentOperation({
          data: { operationId: detail.operation.id, idempotencyKey: crypto.randomUUID() },
        }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["templates", "scoring"] }),
  });
  const selected = detail?.attempts.find(
      (a) => a.attempt.operationId === (selectedAttempt ?? detail.operation.id),
    ),
    report = selected?.attempt.report;
  const retryAt = Math.max(
    0,
    ...(detail?.fixtureAttempts.map((f) => f.failure?.retryAt ?? 0) ?? []),
  );
  return (
    <EvidenceDialog
      title="Canonical fixture results"
      description="Complete synthetic inputs, six independent simulations, and the retained report for this exact graph."
      onClose={onClose}
      wide
    >
      <div className="min-w-0 space-y-6">
        <Failure error={query.error ?? retry.error ?? cancel.error} />
        {query.isPending && <p role="status">Loading retained fixture results…</p>}
        {detail && (
          <>
            <p role="status" className="text-sm">
              {detail.operation.stage} · attempt {detail.run.attempts}/3
            </p>
            <div className="flex flex-wrap gap-3">
              {active && (
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Cancel scoring
                </Button>
              )}
              {!active &&
                !detail.run.completedAt &&
                detail.run.attempts < 3 &&
                runtimeConfigured && (
                  <Button
                    disabled={retry.isPending || Date.now() < retryAt}
                    onClick={() => retry.mutate({ id, revision: detail.run.revision })}
                  >
                    Retry unfinished fixtures
                  </Button>
                )}
            </div>
            {retryAt > Date.now() && (
              <p className="text-sm">
                Provider retry available after {new Date(retryAt).toLocaleString()}. Reopen this
                review to refresh availability.
              </p>
            )}
            {detail.operation.failure && (
              <p className="whitespace-pre-wrap text-sm">{detail.operation.failure}</p>
            )}
            {!detail.run.completedAt && detail.run.attempts >= 3 && !active && (
              <p className="text-sm">
                This run used all three attempts. Retained results remain available. Review the
                failure before starting a new qualification.
              </p>
            )}
            <fieldset className="flex flex-wrap gap-2" aria-label="Qualification attempts">
              {detail.attempts.map((item) => (
                <Button
                  key={item.attempt.operationId}
                  variant={
                    selected?.attempt.operationId === item.attempt.operationId
                      ? "secondary"
                      : "outline"
                  }
                  onClick={() => setSelectedAttempt(item.attempt.operationId)}
                >
                  Attempt {item.attempt.ordinal} · {item.operation.state}
                </Button>
              ))}
            </fieldset>
            <section className="space-y-[18px] rounded-md border bg-card p-6">
              <Badge
                variant="outline"
                className={report?.qualified ? "border-primary/30 bg-primary/10 text-primary" : ""}
              >
                {report?.qualified ? "ATS Screener tested" : "Designation withheld"}
              </Badge>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {detail.run.fixtureSet.version} · graph {detail.run.graphDigest}
              </p>
              {selected?.attempt.completedAt && (
                <p className="text-sm">
                  Report retained {new Date(selected.attempt.completedAt).toLocaleString()}
                </p>
              )}
              {report?.issues.map((issue) => (
                <p key={issue} className="text-sm">
                  {issue}
                </p>
              ))}
              {detail.run.fixtureSet.fixtures.map((fixture) => {
                const result = report?.fixtures.find((f) => f.fixtureId === fixture.id),
                  stored = detail.fixtures.find((f) => f.fixtureId === fixture.id),
                  failure = detail.fixtureHistory.find(
                    (f) =>
                      f.operationId === selected?.attempt.operationId && f.fixtureId === fixture.id,
                  )?.failure;
                return (
                  <section key={fixture.id} className="space-y-4 border-t pt-5">
                    <h3 className="text-base font-semibold">{fixture.name}</h3>
                    {failure && <p className="text-sm">{failure.message}</p>}
                    {!result?.response && (
                      <p className="text-sm text-muted-foreground">
                        No completed result in this attempt’s report. No pass count inferred.
                      </p>
                    )}
                    {result?.issues.map((issue) => (
                      <p key={issue} className="text-sm">
                        {issue}
                      </p>
                    ))}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {result?.response?.results.map((score) => (
                        <details key={score.system} className="min-w-0 rounded-sm border p-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            {score.system} · {score.passesFilter ? "Pass" : "Below threshold"} ·{" "}
                            {score.overallScore}
                          </summary>
                          <div className="mt-4 space-y-4">
                            <ScoreDimensions score={score} />
                            <h4 className="font-semibold">Suggestions</h4>
                            {!score.suggestions.length && (
                              <p className="text-sm">No suggestions returned.</p>
                            )}
                            {score.suggestions.map((suggestion, index) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: Immutable provider suggestions may repeat; preserve their exact order.
                              <div key={`${score.system}-${index}`} className="space-y-2 text-sm">
                                <p className="whitespace-pre-wrap break-words">
                                  {typeof suggestion === "string" ? suggestion : suggestion.summary}
                                </p>
                                {typeof suggestion !== "string" && (
                                  <>
                                    <p>
                                      {suggestion.impact} impact · {suggestion.platforms.join(", ")}
                                    </p>
                                    {suggestion.details.map((text, i) => (
                                      <p
                                        // biome-ignore lint/suspicious/noArrayIndexKey: Immutable provider explanations may repeat and must remain visible.
                                        key={`${index}-${i}`}
                                        className="whitespace-pre-wrap break-words"
                                      >
                                        {text}
                                      </p>
                                    ))}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                    <SavedText title="Complete canonical job" text={fixture.jobDescription} />
                    <CodePayload label="Complete canonical document" value={fixture.document} />
                    {stored?.document && (
                      <>
                        <SavedText
                          title="Exact submitted résumé text"
                          text={stored.document.input.resumeText}
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setPdf(pdf === fixture.id ? null : fixture.id)}
                          >
                            {pdf === fixture.id ? "Hide" : "View"} fixture PDF
                          </Button>
                          {(["pdf", "tex", "text", "report"] as const).map((kind) => (
                            <a
                              key={kind}
                              className="text-sm underline underline-offset-4"
                              href={`/api/template-scores/${id}/${fixture.id}/${kind}?download`}
                              download
                            >
                              {kind === "text"
                                ? "Extracted text"
                                : kind === "report"
                                  ? "Validation report"
                                  : kind.toUpperCase()}
                            </a>
                          ))}
                        </div>
                        {pdf === fixture.id && (
                          <PdfPreview url={`/api/template-scores/${id}/${fixture.id}/pdf`} />
                        )}
                        <CodePayload
                          label="Document, resource, and scoring identities"
                          value={{
                            ...stored.document.input,
                            resumeText: undefined,
                            jobDescription: undefined,
                            validationJson: undefined,
                            resultOperationId: stored.resultOperationId,
                            resultDigest: stored.resultDigest,
                            scoringIdentity: result?.response?._scoringIdentity ?? null,
                          }}
                        />
                      </>
                    )}
                    {stored?.rawResponseJson &&
                      result?.runId === `${stored.resultOperationId}/${fixture.id}` && (
                        <SavedText
                          title="Complete raw provider response"
                          text={stored.rawResponseJson}
                        />
                      )}
                  </section>
                );
              })}
            </section>
            <CodePayload
              label="Complete retained qualification report"
              value={{
                operationId: selected?.attempt.operationId,
                reportDigest: selected?.attempt.reportDigest,
                report,
              }}
            />
            <p className="text-sm text-muted-foreground">
              This designation applies to the captured graph, fixture set, and scoring identity on
              the reported date. New revisions require new results. Export remains available when
              scoring fails.
            </p>
          </>
        )}
      </div>
    </EvidenceDialog>
  );
}
