import {
  type AiEvidenceCandidate,
  isQualification,
  type JobAiInput,
  type JobAiProposal,
  type JobRequirement,
  selectionIdentity,
} from "@river/domain";
import { useState } from "react";
import { FormField, MaterialSummary, selectClass } from "~/components/evidence/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { type Choice, JobEvidenceInspector } from "./evidence-selection";
import type { JobDetail } from "./shared";

export function RequirementCard({
  requirement,
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
    </article>
  );
}

export function RequirementComparison({
  input,
  proposal,
  selected,
  onSelection,
}: {
  selected?: ReadonlySet<string>;
  onSelection?: (id: string, checked: boolean) => void;
  input: JobAiInput;
  proposal: Extract<JobAiProposal, { type: "requirements" }>;
}) {
  const original = new Set(input.workspace.requirements.map((item) => item.id));
  const proposed = new Set(proposal.requirements.map((item) => item.id));
  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className="min-w-0 space-y-3">
        <h3 className="font-editorial text-2xl">
          Current requirements · {input.workspace.requirements.length}
        </h3>
        {input.workspace.requirements.map((requirement) => (
          <RequirementCard
            key={requirement.id}
            requirement={requirement}
            posting={input.posting}
            label={proposed.has(requirement.id) ? "Current requirement" : "Removed requirement"}
          />
        ))}
        {!original.size && (
          <p className="text-sm text-muted-foreground">No saved requirements yet.</p>
        )}
      </section>
      <section className="min-w-0 space-y-3">
        <h3 className="font-editorial text-2xl">
          Suggested requirements · {proposal.requirements.length}
        </h3>
        {proposal.requirements.map((requirement) => (
          <div key={requirement.id} className="space-y-2">
            {onSelection && (
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected?.has(requirement.id) ?? false}
                  onChange={(event) => onSelection(requirement.id, event.target.checked)}
                />
                Use requirement
              </label>
            )}
            <RequirementCard
              requirement={requirement}
              posting={input.posting}
              label={`${requirement.kind ?? "Qualification"} · ${original.has(requirement.id) ? "Updated" : "Added"}`}
            />
          </div>
        ))}
        {!proposed.size && (
          <p className="text-sm text-muted-foreground">
            These suggestions remove every requirement.
          </p>
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
  readOnly,
  busy,
  onChoose,
}: {
  candidate: AiEvidenceCandidate;
  result: Extract<JobAiProposal, { type: "ranking" }>["results"][number];
  input: JobAiInput;
  detail: JobDetail;
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
      </div>
      <p className="text-base whitespace-pre-wrap break-words">{candidate.material.assertion}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{result.explanation}</p>
      <p className="text-sm text-muted-foreground">
        Ranked for: {originalRequirement?.text ?? "General relevance to this job"}
      </p>

      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
          Supporting evidence
        </summary>
        <MaterialSummary
          material={candidate.material}
          contexts={candidate.contexts.map((item) => ({
            revisionId: item.pinnedRevisionId,
            data: item.data,
          }))}
        />
      </details>
      {
        <>
          <FormField label="Use for requirement">
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
              {detail.workspace.data.requirements.filter(isQualification).map((item) => (
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
      }
      <Button
        variant="outline"
        className="min-h-11 whitespace-normal"
        onClick={() => setInspect(true)}
      >
        Inspect current evidence and choose
      </Button>
      {inspect && (
        <JobEvidenceInspector
          selection={{
            claimId: candidate.claimId,
            evidenceRevisionId: candidate.evidenceRevisionId,
            requirementId: association || null,
          }}
          readOnly={readOnly || !validTarget}
          busy={busy}
          allowSelection={validTarget}
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
  readOnly,
  busy,
  onChoose,
  selected,
  onSelection,
}: {
  selected?: ReadonlySet<string>;
  onSelection?: (id: string, checked: boolean) => void;
  input: JobAiInput;
  proposal: Extract<JobAiProposal, { type: "ranking" }>;
  detail: JobDetail;
  readOnly: boolean;
  busy: boolean;
  onChoose: (choice: Choice) => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-sm">
        Suggestions cover {input.candidates.length} matching evidence items. Search the evidence
        bank for experience that may be missing.
      </p>
      {
        <p className="rounded-sm border bg-accent p-4 text-sm">
          Choose relevant evidence to use for this job.
        </p>
      }
      {proposal.results.map((result) => {
        const candidate = input.candidates.find(
          (item) =>
            item.claimId === result.claimId &&
            item.evidenceRevisionId === result.evidenceRevisionId,
        );
        return candidate ? (
          <div key={selectionIdentity(result)}>
            {onSelection && (
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected?.has(selectionIdentity(result)) ?? false}
                  onChange={(event) => onSelection(selectionIdentity(result), event.target.checked)}
                />
                Use match
              </label>
            )}
            <RankingResult {...{ candidate, result, input, detail, readOnly, busy, onChoose }} />
          </div>
        ) : null;
      })}
      {proposal.gaps.map((gap) => (
        <div
          key={gap.requirementId}
          className="space-y-2 rounded-sm border border-highlight bg-highlight/10 p-4"
        >
          <h4 className="font-semibold">No supporting evidence found</h4>
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
