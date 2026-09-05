import { canonicalJson, type ReviewState } from "@river/domain";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Conflict,
  type EvidenceDetail,
  EvidenceDialog,
  FormField,
  MetadataSummary,
  useEvidenceCommand,
} from "./shared";

export function ReviewDialog({
  detail,
  action,
  onClose,
}: {
  detail: EvidenceDetail;
  action: "review" | "metadata" | "archive";
  onClose: () => void;
}) {
  const [observed, setObserved] = useState(detail);
  const [state, setState] = useState<ReviewState>(detail.claim.reviewState);
  const [rationale, setRationale] = useState("");
  const [metadata, setMetadata] = useState(detail.claim.metadata);
  const save = useEvidenceCommand(onClose);
  const material = observed.revisions.find(
    (r) => r.id === observed.claim.currentRevisionId,
  )?.material;
  const archive = !observed.claim.archivedAt;
  const title =
    action === "review"
      ? "Review claim"
      : action === "metadata"
        ? "Edit metadata"
        : archive
          ? "Archive claim"
          : "Restore claim";
  const description =
    action === "review"
      ? "Attach a decision to the displayed evidence revision."
      : action === "metadata"
        ? "Labels, tags, and notes do not change the assertion or its verification."
        : archive
          ? "This claim leaves default search. Original sources, revisions, and decisions remain available."
          : "Return this claim to active search with its saved assertion and review state.";
  const dirty =
    Boolean(rationale) ||
    state !== detail.claim.reviewState ||
    canonicalJson(metadata) !== canonicalJson(detail.claim.metadata);
  return (
    <EvidenceDialog
      title={title}
      description={description}
      onClose={onClose}
      dirty={dirty}
      pending={save.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const base = { id: observed.claim.id, revision: observed.claim.revision };
          if (action === "review")
            save.mutate({
              ...base,
              type: "review",
              revisionId: observed.claim.currentRevisionId,
              state,
              rationale,
            });
          else if (action === "metadata")
            save.mutate({
              ...base,
              type: "metadata",
              metadata: {
                ...metadata,
                tags: metadata.tags.map((tag) => tag.trim()).filter(Boolean),
              },
            });
          else save.mutate({ ...base, type: "archive", archived: archive, rationale });
        }}
      >
        <blockquote className="border-l-2 pl-4 font-editorial text-xl leading-7">
          {observed.claim.assertion}
        </blockquote>
        {action === "review" && (
          <fieldset className="space-y-3">
            <legend className="mb-3 font-medium">Decision</legend>
            {(["Verified", "Needs clarification", "Draft"] as const).map((value) => (
              <label key={value} className="flex items-center gap-3 rounded-sm border p-3">
                <input
                  type="radio"
                  name="review-state"
                  checked={state === value}
                  onChange={() => setState(value)}
                  disabled={value === "Verified" && !material?.citations.length}
                />
                {value}
              </label>
            ))}
            {!material?.citations.length && (
              <p className="text-muted-foreground">Add a citation before verifying this claim.</p>
            )}
          </fieldset>
        )}
        {action === "metadata" ? (
          <>
            <FormField label="Label">
              <Input
                maxLength={200}
                value={metadata.label}
                onChange={(event) => setMetadata({ ...metadata, label: event.target.value })}
              />
            </FormField>
            <FormField label="Tags (comma separated)">
              <Input
                value={metadata.tags.join(",")}
                onChange={(event) =>
                  setMetadata({ ...metadata, tags: event.target.value.split(",") })
                }
              />
            </FormField>
            <FormField label="Private notes">
              <Textarea
                maxLength={4000}
                value={metadata.notes}
                onChange={(event) => setMetadata({ ...metadata, notes: event.target.value })}
              />
            </FormField>
          </>
        ) : (
          <FormField label="Rationale">
            <Textarea
              required
              maxLength={4000}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Explain the decision and what you checked."
            />
          </FormField>
        )}
        <Conflict
          error={save.error}
          id={observed.claim.id}
          local={
            action === "metadata" ? (
              <MetadataSummary metadata={metadata} />
            ) : (
              <div>
                <p>{state}</p>
                <p className="mt-3 whitespace-pre-wrap">{rationale}</p>
              </div>
            )
          }
          onReload={(latest) => {
            setObserved(latest);
            setState(latest.claim.reviewState);
            setMetadata(latest.claim.metadata);
            setRationale("");
            save.reset();
          }}
        />
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={save.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={
              save.isPending ||
              (action !== "metadata" && !rationale.trim()) ||
              (action === "review" && state === "Verified" && !material?.citations.length)
            }
          >
            {save.isPending
              ? "Saving…"
              : action === "review"
                ? "Record decision"
                : action === "metadata"
                  ? "Save metadata"
                  : title}
          </Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
