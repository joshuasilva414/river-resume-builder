import type { ReviewScoringFindingRequest } from "@river/contracts";
import {
  type PlatformScore,
  ScoringFindingOutcome,
  ScoringPlatform,
  scoringPlatforms,
} from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { type getScoringRun, saveScoringFinding } from "~/server/scoring-functions";

export type ScoringDetail = Extract<
  Awaited<ReturnType<typeof getScoringRun>>,
  { ok: true }
>["value"];
export function SavedText({ title, text }: { title: string; text: string }) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
        {text}
      </pre>
    </details>
  );
}
function Passages({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div className="space-y-1 text-sm">
      <h4 className="font-medium">{label}</h4>
      {values.length ? (
        <ul className="list-disc space-y-1 pl-5">
          {values.map((value, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Provider passages are immutable ordered data; repeated passages must remain visible.
            <li key={`${index}-${value}`} className="whitespace-pre-wrap break-words">
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">None reported</p>
      )}
    </div>
  );
}
export function ScoreDimensions({ score }: { score: PlatformScore }) {
  const { formatting, keywordMatch, sections, experience, education } = score.breakdown;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-semibold">Formatting · {formatting.score} / 100</h3>
        <Passages label="Issues" values={formatting.issues} />
        <Passages label="Details" values={formatting.details} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Keyword match · {keywordMatch.score} / 100</h3>
        <Passages label="Matched" values={keywordMatch.matched} />
        <Passages label="Missing" values={keywordMatch.missing} />
        <Passages label="Synonym matches" values={keywordMatch.synonymMatched} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Sections · {sections.score} / 100</h3>
        <Passages label="Present" values={sections.present} />
        <Passages label="Missing" values={sections.missing} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Experience · {experience.score} / 100</h3>
        <p className="text-sm">
          Quantified bullets: {experience.quantifiedBullets} / {experience.totalBullets} · Action
          verbs: {experience.actionVerbCount}
        </p>
        <Passages label="Highlights" values={experience.highlights} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Education · {education.score} / 100</h3>
        <Passages label="Notes" values={education.notes} />
      </section>
    </div>
  );
}
export function ScoreResults({ detail }: { detail: ScoringDetail }) {
  const [platform, setPlatform] = useState<ScoringPlatform>("Workday");
  const [review, setReview] = useState<ScoringDetail["findings"][number] | null>(null);
  const { run } = detail;
  if (!run.completedAt || !run.result) return null;
  const response = run.result.response,
    score = response.results.find((value) => value.system === platform);
  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-md border bg-card p-5 md:p-6">
        <h2 className="font-editorial text-2xl">Six platform simulations</h2>
        <p className="text-sm">
          {response.results.filter((value) => value.passesFilter).length} of 6 meet the provider’s
          filter.
        </p>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Complete scoring results by platform</caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-3">Platform</th>
              <th className="py-3">Score / 100</th>
              <th className="py-3">Provider filter</th>
            </tr>
          </thead>
          <tbody>
            {scoringPlatforms.map((system) => {
              const value = response.results.find((result) => result.system === system);
              return (
                value && (
                  <tr key={system} className="border-b">
                    <th className="py-4 pr-2 font-medium">{system}</th>
                    <td>{value.overallScore}</td>
                    <td
                      className={value.passesFilter ? "text-approved" : "text-warning-foreground"}
                    >
                      {value.passesFilter ? "Pass" : "Below threshold"}
                    </td>
                  </tr>
                )
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Each platform has its own returned score and filter outcome. These simulations do not
          reproduce a vendor’s actual screening or inspect the PDF’s visual layout.
        </p>
      </section>
      <section className="space-y-5 rounded-md border bg-card p-5 md:p-6">
        <label className="grid gap-2 text-sm font-semibold">
          Platform
          <select
            className="min-h-11 w-full rounded-sm border bg-background px-3"
            value={platform}
            onChange={(event) =>
              setPlatform(Schema.decodeUnknownSync(ScoringPlatform)(event.target.value))
            }
          >
            {scoringPlatforms.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {score && (
          <>
            <h2 className="font-editorial text-2xl">
              {platform} · {score.overallScore} / 100
            </h2>
            <p className="text-sm">
              {score.vendor} · Provider filter: {score.passesFilter ? "Pass" : "Below threshold"}
            </p>
            <ScoreDimensions score={score} />
          </>
        )}
        <h3 className="border-t pt-5 font-editorial text-xl">Findings</h3>
        {detail.findings
          .filter((finding) => finding.platform === platform)
          .map((finding) => {
            const decision = detail.decisions.find(
                (value) => value.findingDigest === finding.digest,
              ),
              suggestion = finding.suggestion;
            return (
              <article key={finding.digest} className="space-y-3 rounded-sm border p-4">
                <p className="whitespace-pre-wrap break-words font-medium">
                  {typeof suggestion === "string" ? suggestion : suggestion.summary}
                </p>
                {typeof suggestion !== "string" && (
                  <>
                    <p className="eyebrow">
                      {suggestion.impact} impact · {suggestion.platforms.join(" · ")}
                    </p>
                    <Passages label="Provider explanation" values={suggestion.details} />
                  </>
                )}
                <p className="text-sm">Review: {decision?.outcome ?? "Unreviewed"}</p>
                {decision && (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm">{decision.rationale}</p>
                    <p className="text-xs text-muted-foreground">
                      Owner · {new Date(decision.updatedAt).toLocaleString()} · Review revision{" "}
                      {decision.revision}
                    </p>
                  </>
                )}
                <Button variant="outline" onClick={() => setReview(finding)}>
                  Review finding
                </Button>
              </article>
            );
          })}
        {score?.suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No suggestions were returned for this platform.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Provider suggestions do not establish evidence. Editing a résumé does not automatically
          address a finding.
        </p>
      </section>
      <SavedText
        title="Scoring identity"
        text={JSON.stringify(
          {
            resultDigest: run.result.digest,
            identity: run.result.response._scoringIdentity ?? null,
          },
          null,
          2,
        )}
      />
      <SavedText title="Complete raw provider response" text={run.result.rawJson} />
      {review && (
        <FindingReview
          key={review.digest}
          detail={detail}
          finding={review}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
function FindingReview({
  detail,
  finding,
  onClose,
}: {
  detail: ScoringDetail;
  finding: ScoringDetail["findings"][number];
  onClose: () => void;
}) {
  const [saved] = useState(() =>
    detail.decisions.find((value) => value.findingDigest === finding.digest),
  );
  const client = useQueryClient();
  const [outcome, setOutcome] = useState<ScoringFindingOutcome | "">(saved?.outcome ?? ""),
    [rationale, setRationale] = useState(saved?.rationale ?? "");
  const [request, setRequest] = useState<ReviewScoringFindingRequest | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!outcome || !detail.run.result) throw new Error("Select a review outcome.");
      const payload = request ?? {
        runId: detail.run.id,
        resultDigest: detail.run.result.digest,
        platform: finding.platform,
        index: finding.index,
        findingDigest: finding.digest,
        revision: saved?.revision ?? 0,
        outcome,
        rationale,
        idempotencyKey: crypto.randomUUID(),
      };
      setRequest(payload);
      return unwrap(await saveScoringFinding({ data: payload }));
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["scoring-run", detail.run.id] });
      onClose();
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["scoring-run", detail.run.id] });
    },
  });
  return (
    <EvidenceDialog
      title="Review this finding"
      description={`${finding.platform} · Result ${detail.run.id.slice(-8)}. This decision applies to this exact suggestion.`}
      onClose={onClose}
      dirty={outcome !== (saved?.outcome ?? "") || rationale !== (saved?.rationale ?? "")}
      pending={mutation.isPending}
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap break-words">
          {typeof finding.suggestion === "string" ? finding.suggestion : finding.suggestion.summary}
        </p>
        {typeof finding.suggestion !== "string" && (
          <Passages label="Complete provider explanation" values={finding.suggestion.details} />
        )}
        <label className="grid gap-2 text-sm font-semibold">
          Review outcome
          <select
            className="min-h-11 rounded-sm border bg-background px-3"
            disabled={!!request}
            value={outcome}
            onChange={(event) =>
              setOutcome(Schema.decodeUnknownSync(ScoringFindingOutcome)(event.target.value))
            }
          >
            <option disabled value="">
              Choose an outcome
            </option>
            {["Addressed", "Accepted", "Not applicable"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label
          htmlFor={`finding-rationale-${finding.digest}`}
          className="grid gap-2 text-sm font-semibold"
        >
          Rationale
          <Textarea
            id={`finding-rationale-${finding.digest}`}
            value={rationale}
            disabled={!!request}
            maxLength={2000}
            rows={4}
            onChange={(event) => setRationale(event.target.value)}
          />
        </label>
        <Failure error={mutation.error} />
        {mutation.error && (
          <p className="text-sm text-muted-foreground">
            Your attempted decision is preserved here. Retry the same request, or close this review
            and compare the refreshed saved decision.
          </p>
        )}
        <Button
          disabled={!outcome || !rationale.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving review…" : mutation.error ? "Retry review" : "Save review"}
        </Button>
      </div>
    </EvidenceDialog>
  );
}
