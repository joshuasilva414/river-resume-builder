import type { AiEvidenceCandidate, JobAiInput, JobAiProposal, JobRequirement } from "@river/domain";
import { useState } from "react";
import { FormField, MaterialSummary, selectClass } from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { type Choice, JobEvidenceInspector } from "./evidence-selection";
import type { JobDetail } from "./shared";

export function RequirementCard({
  requirement,
  posting,
  label,
}: {
  requirement: JobRequirement;
  posting: string;
  label: string;
}) {
  return (
    <article className="min-w-0 space-y-3 rounded-sm border p-4">
      <p className="eyebrow">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{requirement.priority}</Badge>
        <span className="text-xs text-muted-foreground">{requirement.category}</span>
      </div>
      <h4 className="text-lg font-semibold leading-[26px] whitespace-pre-wrap break-words">
        {requirement.text}
      </h4>
      <p className="text-sm">Keywords: {requirement.keywords.join(", ") || "None"}</p>
      <p className="text-xs text-muted-foreground">
        Interpretation confidence:{" "}
        {requirement.confidence === null
          ? "Unspecified"
          : `${Math.round(requirement.confidence * 100)}%`}
      </p>
      <p className="font-mono text-[11px] break-all">Requirement {requirement.id}</p>
      {requirement.passages.map((passage) => (
        <div key={`${passage.start}:${passage.end}`} className="space-y-2">
          <blockquote className="border-l-2 border-primary bg-muted p-3 text-base leading-[23px] whitespace-pre-wrap break-words">
            {passage.quote}
          </blockquote>
          <p className="font-mono text-[11px] text-muted-foreground">
            Offsets {passage.start}–{passage.end} · lines{" "}
            {posting.slice(0, passage.start).split("\n").length}–
            {posting.slice(0, passage.end).split("\n").length}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
              Locate in complete posting
            </summary>
            <p className="max-h-72 overflow-y-auto text-sm whitespace-pre-wrap break-words">
              {posting.slice(0, passage.start)}
              <mark>{posting.slice(passage.start, passage.end)}</mark>
              {posting.slice(passage.end)}
            </p>
          </details>
        </div>
      ))}
      {!requirement.passages.length && (
        <p className="text-sm text-muted-foreground">No supporting passages.</p>
      )}
    </article>
  );
}

export function RequirementComparison({
  input,
  proposal,
}: {
  input: JobAiInput;
  proposal: Extract<JobAiProposal, { type: "requirements" }>;
}) {
  const original = new Set(input.workspace.requirements.map((item) => item.id));
  const proposed = new Set(proposal.requirements.map((item) => item.id));
  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className="min-w-0 space-y-3">
        <h3 className="font-editorial text-2xl">
          Original map · {input.workspace.requirements.length}
        </h3>
        {input.workspace.requirements.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            posting={input.posting}
            label={
              proposed.has(requirement.id)
                ? "Retained identity · original fields"
                : "Removed requirement"
            }
          />
        ))}
        {!original.size && (
          <p className="text-sm text-muted-foreground">No requirements in the captured map.</p>
        )}
      </section>
      <section className="min-w-0 space-y-3">
        <h3 className="font-editorial text-2xl">
          Proposed complete map · {proposal.requirements.length}
        </h3>
        {proposal.requirements.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            posting={input.posting}
            label={
              original.has(requirement.id)
                ? "Retained identity · proposed fields"
                : "Added requirement"
            }
          />
        ))}
        {!proposed.size && (
          <p className="text-sm text-muted-foreground">The proposal removes every requirement.</p>
        )}
      </section>
    </div>
  );
}

function RankingResult({
  candidate,
  result,
  input,
  detail,
  accepted,
  readOnly,
  busy,
  onChoose,
}: {
  candidate: AiEvidenceCandidate;
  result: Extract<JobAiProposal, { type: "ranking" }>["results"][number];
  input: JobAiInput;
  detail: JobDetail;
  accepted: boolean;
  readOnly: boolean;
  busy: boolean;
  onChoose: (choice: Choice) => void;
}) {
  const [association, setAssociation] = useState(result.requirementId ?? "");
  const [inspect, setInspect] = useState(false);
  const currentRequirement = detail.workspace.data.requirements.find(
    (item) => item.id === association,
  );
  const originalRequirement = input.workspace.requirements.find(
    (item) => item.id === result.requirementId,
  );
  const validTarget = !association || Boolean(currentRequirement);
  const selected = detail.selected.find(
    (item) => item.claimId === candidate.claimId && item.requirementId === (association || null),
  );
  return (
    <article className="space-y-3 border-b py-5">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{result.support}</Badge>
        <Badge variant="outline">{candidate.reviewState} at generation</Badge>
      </div>
      <p className="text-base whitespace-pre-wrap break-words">{candidate.material.assertion}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{result.explanation}</p>
      <p className="text-sm text-muted-foreground">
        Ranked for: {originalRequirement?.text ?? "General relevance to this job"}
      </p>
      <p className="font-mono text-[11px] break-all">
        Evidence {candidate.claimId} · revision {candidate.evidenceRevisionId}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
          Evidence and review context supplied to AI
        </summary>
        <MaterialSummary
          material={candidate.material}
          contexts={candidate.contexts.map((item) => ({
            revisionId: item.pinnedRevisionId,
            data: item.data,
          }))}
        />
        <p className="mt-3 text-sm">
          Review: {candidate.reviewState} · {candidate.rationale || "No decision rationale"}
        </p>
        <p className="font-mono text-[11px] break-all">Decision {candidate.decisionId ?? "None"}</p>
      </details>
      {accepted && (
        <>
          <FormField label="Choose an association after inspecting current evidence">
            <select
              className={selectClass}
              value={association}
              disabled={readOnly || busy}
              onChange={(event) => setAssociation(event.target.value)}
            >
              <option value="">General job selection</option>
              {association && !currentRequirement && (
                <option value={association} disabled>
                  Original requirement is no longer current
                </option>
              )}
              {detail.workspace.data.requirements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text}
                </option>
              ))}
            </select>
          </FormField>
          {currentRequirement && originalRequirement?.text !== currentRequirement.text && (
            <p className="text-sm text-muted-foreground">
              Current requirement: {currentRequirement.text}
            </p>
          )}
          {selected && (
            <p className="text-sm">
              Already selected
              {selected.evidenceRevisionId !== candidate.evidenceRevisionId
                ? " using a different evidence revision"
                : " using this exact revision"}
              .
            </p>
          )}
        </>
      )}
      <Button
        variant="outline"
        className="min-h-11 whitespace-normal"
        onClick={() => setInspect(true)}
      >
        {accepted ? "Inspect current evidence and choose" : "Inspect citation and verification"}
      </Button>
      {inspect && (
        <JobEvidenceInspector
          selection={{
            claimId: candidate.claimId,
            evidenceRevisionId: candidate.evidenceRevisionId,
            requirementId: association || null,
          }}
          readOnly={readOnly || !accepted || !validTarget}
          busy={busy}
          allowSelection={accepted && validTarget}
          onClose={() => setInspect(false)}
          onChoose={onChoose}
        />
      )}
    </article>
  );
}

export function RankingReview({
  input,
  proposal,
  detail,
  accepted,
  readOnly,
  busy,
  onChoose,
}: {
  input: JobAiInput;
  proposal: Extract<JobAiProposal, { type: "ranking" }>;
  detail: JobDetail;
  accepted: boolean;
  readOnly: boolean;
  busy: boolean;
  onChoose: (choice: Choice) => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-sm">
        AI reviewed {input.candidates.length} active search matches, capped at 30. Search:{" "}
        {input.candidateQuery || "No matching search terms"}. This is a bounded review, not
        whole-bank coverage.
      </p>
      {accepted && (
        <p className="rounded-sm border bg-accent p-4 text-sm">
          Ranking review accepted. Inspect the current evidence and select each association
          explicitly. Review acceptance does not select evidence or verify claims.
        </p>
      )}
      {proposal.results.map((result) => {
        const candidate = input.candidates.find(
          (item) =>
            item.claimId === result.claimId &&
            item.evidenceRevisionId === result.evidenceRevisionId,
        );
        return candidate ? (
          <RankingResult
            key={`${result.claimId}:${result.requirementId}`}
            {...{ candidate, result, input, detail, accepted, readOnly, busy, onChoose }}
          />
        ) : null;
      })}
      {proposal.gaps.map((gap) => (
        <div
          key={gap.requirementId}
          className="space-y-2 rounded-sm border border-highlight bg-highlight/10 p-4"
        >
          <h4 className="font-semibold">Gap in reviewed candidates</h4>
          <p className="text-sm">
            {input.workspace.requirements.find((item) => item.id === gap.requirementId)?.text}
          </p>
          <p className="text-sm whitespace-pre-wrap">{gap.explanation}</p>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        A requirement remains a selection gap until you choose supporting evidence for that
        requirement. A general job selection does not close it.
      </p>
    </section>
  );
}
