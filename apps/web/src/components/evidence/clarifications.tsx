import type { AnswerClarificationRequest } from "@river/contracts";
import { canonicalJson } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { SourceIntake } from "~/components/source-intake";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getClarifications, resolveClarification } from "~/server/source-ai-functions";
import { type EvidenceDetail, Failure, FormField, selectClass, unwrap } from "./shared";

type Question = Extract<
  Awaited<ReturnType<typeof getClarifications>>,
  { ok: true }
>["value"][number];
export function Clarifications({
  detail,
  canEdit,
  onEdit,
  onInspectRevision,
}: {
  detail: EvidenceDetail;
  canEdit: boolean;
  onEdit?: () => void;
  onInspectRevision: (id: string) => void;
}) {
  const questions = useQuery({
    queryKey: ["evidence", "clarifications", detail.claim.id],
    queryFn: async () => unwrap(await getClarifications({ data: { claimId: detail.claim.id } })),
  });
  if (!questions.data?.length && !questions.error) return null;
  return (
    <section className="space-y-4 border-y py-5" aria-label="Clarification questions">
      <h3 className="font-editorial text-[28px] leading-[34px]">Clarification requested</h3>
      <p className="text-sm text-muted-foreground">
        Questions are linked to the evidence revision that prompted them. Answering does not change
        verification.
      </p>
      <Failure error={questions.error} />
      {questions.data?.map((question) => (
        <QuestionReview
          key={question.id}
          question={question}
          detail={detail}
          canEdit={canEdit}
          onEdit={onEdit}
          onInspectRevision={onInspectRevision}
        />
      ))}
      {questions.data?.length === 100 && (
        <p className="text-xs text-muted-foreground">Showing the 100 most recent questions.</p>
      )}
    </section>
  );
}
function QuestionReview({
  question,
  detail,
  canEdit,
  onEdit,
  onInspectRevision,
}: {
  question: Question;
  detail: EvidenceDetail;
  canEdit: boolean;
  onEdit?: () => void;
  onInspectRevision: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [addedSource, setAddedSource] = useState<string | null>(null),
    [selectedSource, setSource] = useState("");
  const client = useQueryClient(),
    command = useRef<{ payload: string; key: string } | null>(null);
  const current = detail.revisions.find((item) => item.id === detail.claim.currentRevisionId),
    original = detail.revisions.find((item) => item.id === question.evidenceRevisionId);
  const availableSources = [
    ...new Set(current?.material.citations.map((citation) => citation.sourceId) ?? []),
  ];
  const sourceId = availableSources.includes(selectedSource) ? selectedSource : "";
  const answer = useMutation({
    mutationFn: async (input: Omit<AnswerClarificationRequest, "idempotencyKey">) => {
      const payload = canonicalJson(input);
      if (command.current?.payload !== payload)
        command.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await resolveClarification({ data: { ...input, idempotencyKey: command.current.key } }),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["evidence"] }),
  });
  const revisedWithCitation = Boolean(
    canEdit && current && current.id !== question.evidenceRevisionId && availableSources.length,
  );
  const canAnswer = revisedWithCitation && Boolean(sourceId);
  return (
    <article className="space-y-3 rounded-sm border p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{question.answeredAt ? "Answer recorded" : "Unanswered"}</Badge>
        <p className="text-xs text-muted-foreground">
          {new Date(question.createdAt).toLocaleString()}
        </p>
      </div>
      <p className="font-semibold leading-[23px] whitespace-pre-wrap break-words">
        {question.question}
      </p>
      <details>
        <summary className="cursor-pointer text-primary">
          Original assertion and question identity
        </summary>
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap break-words">{original?.material.assertion}</p>
          <p className="break-all font-mono text-xs">
            Evidence revision {question.evidenceRevisionId}
          </p>
          <p className="break-all font-mono text-xs">Candidate {question.candidateId}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onInspectRevision(question.evidenceRevisionId)}
          >
            Inspect original evidence
          </Button>
        </div>
      </details>
      {question.answeredAt && question.answerEvidenceRevisionId ? (
        <div className="space-y-3">
          <p>
            Recorded {new Date(question.answeredAt).toLocaleString()}. The answer is retained with
            its source and evidence revision.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (question.answerEvidenceRevisionId)
                  onInspectRevision(question.answerEvidenceRevisionId);
              }}
            >
              Inspect answering revision
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/v1/sources/${question.answerSourceId}?download`}>
                Download answering source
              </a>
            </Button>
          </div>
        </div>
      ) : canEdit ? (
        <>
          <p className="text-muted-foreground">
            Add a supporting source or an Owner attestation. Edit the claim to cite the answer in a
            new Draft revision, then record the answer here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Add supporting source
            </Button>
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit claim and cite answer
              </Button>
            )}
          </div>
          {addedSource && (
            <p role="status">
              Supporting source saved. Select its completed extraction when adding the claim’s
              citation.
            </p>
          )}
          {revisedWithCitation && (
            <FormField label="Answering source in the current revision">
              <select
                className={selectClass}
                value={sourceId}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="">Choose the source that answers this question</option>
                {availableSources.map((id) => (
                  <option key={id} value={id}>
                    {detail.sources.find((source) => source.id === id)?.title ?? id}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <Failure error={answer.error} />
          <Button
            disabled={!canAnswer || answer.isPending}
            onClick={() => {
              if (current && sourceId)
                answer.mutate({
                  id: question.id,
                  revision: question.revision,
                  claimRevision: detail.claim.revision,
                  answerSourceId: sourceId,
                  answerEvidenceRevisionId: current.id,
                });
            }}
          >
            {answer.isPending ? "Recording…" : "Record answer for this revision"}
          </Button>
          {!revisedWithCitation && (
            <p className="text-xs text-muted-foreground">
              A new evidence revision with a source citation is required. You can leave this
              question for later.
            </p>
          )}
        </>
      ) : (
        !question.answeredAt && (
          <p className="text-muted-foreground">
            Return to the current active claim to add an answer.
          </p>
        )
      )}
      {open && <SourceIntake open={open} onOpenChange={setOpen} onCreated={setAddedSource} />}
    </article>
  );
}
