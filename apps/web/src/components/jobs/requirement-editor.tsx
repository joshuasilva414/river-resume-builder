import type { JobRequirement, RequirementFields } from "@river/domain";
import { useState } from "react";
import { EvidenceDialog, FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { JobConflict, type JobDetail, useJobCommand } from "./shared";

export function RequirementEditor({
  detail,
  requirement,
  onClose,
}: {
  detail: JobDetail;
  requirement?: JobRequirement;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<RequirementFields>(
    requirement ?? {
      kind: "Qualification",
      text: "",
      category: "Skills",
      priority: "Unspecified",
      keywords: [],
      confidence: null,
      passages: [],
    },
  );
  const [keywords, setKeywords] = useState(fields.keywords.join(", "));
  const mutation = useJobCommand(onClose);
  const base = { id: detail.job.id, revision: detail.job.revision, snapshotId: detail.snapshot.id };
  const save = () =>
    mutation.mutate({
      ...base,
      type: "requirement",
      requirementId: requirement?.id ?? null,
      fields: {
        ...fields,
        keywords: [
          ...new Set(
            keywords
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ],
      },
    });
  return (
    <EvidenceDialog
      title={requirement ? "Edit requirement" : "Add requirement"}
      description="Qualifications can match evidence. Eligibility is posting information only."
      onClose={onClose}
      pending={mutation.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FormField label="Type">
          <select
            className={selectClass}
            value={fields.kind ?? "Qualification"}
            onChange={(event) =>
              setFields((value) => ({
                ...value,
                kind: event.target.value === "Eligibility" ? "Eligibility" : "Qualification",
              }))
            }
          >
            <option>Qualification</option>
            <option>Eligibility</option>
          </select>
        </FormField>
        <FormField label="Requirement">
          <Textarea
            required
            maxLength={2000}
            value={fields.text}
            onChange={(event) => setFields((value) => ({ ...value, text: event.target.value }))}
          />
        </FormField>
        <FormField label="Category">
          <Input
            required
            maxLength={60}
            value={fields.category}
            onChange={(event) => setFields((value) => ({ ...value, category: event.target.value }))}
          />
        </FormField>
        <FormField label="Priority">
          <select
            className={selectClass}
            value={fields.priority}
            onChange={(event) =>
              setFields((value) => ({
                ...value,
                priority:
                  event.target.value === "Required"
                    ? "Required"
                    : event.target.value === "Preferred"
                      ? "Preferred"
                      : "Unspecified",
              }))
            }
          >
            <option>Required</option>
            <option>Preferred</option>
            <option>Unspecified</option>
          </select>
        </FormField>
        <FormField label="Keywords">
          <Input value={keywords} onChange={(event) => setKeywords(event.target.value)} />
        </FormField>
        <JobConflict
          error={mutation.error}
          id={detail.job.id}
          local={<p>{fields.text}</p>}
          onReload={onClose}
        />
        <div className="flex flex-wrap justify-end gap-3">
          {requirement && (
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  ...base,
                  type: "remove-requirement",
                  requirementId: requirement.id,
                })
              }
            >
              Delete requirement
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending}>Save requirement</Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
