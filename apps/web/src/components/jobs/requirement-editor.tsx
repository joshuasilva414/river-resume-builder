import {
  canonicalJson,
  type JobRequirement,
  type PostingPassage,
  type RequirementFields,
} from "@river/domain";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { EvidenceDialog, FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
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
  const mutation = useJobCommand(onClose);
  const [passages, setPassages] = useState<readonly (typeof PostingPassage.Type)[]>(
    requirement?.passages ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [remove, setRemove] = useState(false);
  const passageButton = useRef<HTMLButtonElement>(null);
  const wasPicking = useRef(false);
  useEffect(() => {
    if (wasPicking.current && !picking) passageButton.current?.focus();
    wasPicking.current = picking;
  }, [picking]);
  const fields =
    requirement ??
    ({
      text: "",
      category: "",
      priority: "Unspecified",
      keywords: [],
      confidence: null,
    } satisfies Partial<RequirementFields>);
  const form = useForm({
    defaultValues: {
      text: fields.text,
      category: fields.category,
      priority: fields.priority,
      keywords: fields.keywords.join(", "),
      confidence: fields.confidence === null ? "" : String(fields.confidence * 100),
    },
    onSubmit: async ({ value }) => {
      await mutation
        .mutateAsync({
          type: "requirement",
          id: detail.job.id,
          revision: detail.job.revision,
          snapshotId: detail.snapshot.id,
          requirementId: requirement?.id ?? null,
          fields: {
            text: value.text,
            category: value.category,
            priority: value.priority,
            keywords: [
              ...new Set(
                value.keywords
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ],
            confidence: value.confidence.trim() === "" ? null : Number(value.confidence) / 100,
            passages,
          },
        })
        .catch(() => {});
    },
  });
  return (
    <form.Subscribe selector={(state) => [state.values, state.isDirty] as const}>
      {([values, dirty]) => (
        <EvidenceDialog
          title={
            picking
              ? "Select supporting passage"
              : remove
                ? "Remove requirement?"
                : requirement
                  ? "Edit requirement"
                  : "Add requirement"
          }
          description={
            picking
              ? "Select or paste an exact quote from this immutable posting."
              : remove
                ? "This removes the requirement and its current evidence associations. General selections and earlier revisions remain."
                : "Save one qualification or responsibility from this posting. Each change creates a new requirement map revision."
          }
          dirty={dirty || canonicalJson(passages) !== canonicalJson(requirement?.passages ?? [])}
          onClose={onClose}
          pending={mutation.isPending}
          className="sm:max-w-[736px]"
        >
          {picking ? (
            <PostingQuote
              snapshot={detail.snapshot}
              onCancel={() => setPicking(false)}
              onAdd={(passage) => {
                setPassages((previous) => [
                  ...previous.filter((p) => p.start !== passage.start || p.end !== passage.end),
                  passage,
                ]);
                setPicking(false);
              }}
            />
          ) : remove ? (
            <div className="space-y-5">
              <p>{requirement?.text}</p>
              <JobConflict
                error={mutation.error}
                id={detail.job.id}
                local={<p>Remove {requirement?.text}</p>}
                onReload={onClose}
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setRemove(false)}>
                  Keep requirement
                </Button>
                <Button
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (requirement)
                      mutation.mutate({
                        type: "remove-requirement",
                        id: detail.job.id,
                        revision: detail.job.revision,
                        snapshotId: detail.snapshot.id,
                        requirementId: requirement.id,
                      });
                  }}
                >
                  Remove requirement
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field name="text">
                {(field) => (
                  <FormField label="Requirement text">
                    <Textarea
                      required
                      maxLength={2000}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </FormField>
                )}
              </form.Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <form.Field name="category">
                  {(field) => (
                    <FormField label="Category">
                      <Input
                        required
                        maxLength={60}
                        list="requirement-categories"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FormField>
                  )}
                </form.Field>
                <datalist id="requirement-categories">
                  {[
                    "Skills",
                    "Experience",
                    "Education",
                    "Responsibilities",
                    "Credentials",
                    "Other",
                  ].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <form.Field name="priority">
                  {(field) => (
                    <FormField label="Priority">
                      <select
                        className={selectClass}
                        value={field.state.value}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (
                            value === "Required" ||
                            value === "Preferred" ||
                            value === "Unspecified"
                          )
                            field.handleChange(value);
                        }}
                      >
                        {["Required", "Preferred", "Unspecified"].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </FormField>
                  )}
                </form.Field>
              </div>
              <form.Field name="keywords">
                {(field) => (
                  <FormField label="Keywords (comma separated)">
                    <Input
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="confidence">
                {(field) => (
                  <FormField label="Confidence in interpretation (optional %)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      className="sm:max-w-56"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </FormField>
                )}
              </form.Field>
              <p className="text-sm text-muted-foreground">
                How certain you are that the posting supports this requirement. Blank means
                unspecified. This does not measure candidate fit.
              </p>
              <section className="space-y-3 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-sans text-sm font-semibold">Supporting passages</h3>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={passages.length >= 5}
                    ref={passageButton}
                    onClick={() => setPicking(true)}
                  >
                    Select from posting
                  </Button>
                </div>
                {passages.map((p) => (
                  <blockquote key={`${p.start}:${p.end}`} className="border-l-2 pl-4">
                    <p className="whitespace-pre-wrap">{p.quote}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Line {detail.snapshot.text.slice(0, p.start).split("\n").length} · offsets{" "}
                      {p.start}–{p.end}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPassages(passages.filter((item) => item !== p))}
                    >
                      Remove passage
                    </Button>
                  </blockquote>
                ))}
                {!passages.length && (
                  <p className="text-sm text-muted-foreground">No supporting passage</p>
                )}
              </section>
              <JobConflict
                error={mutation.error}
                id={detail.job.id}
                local={
                  <div className="space-y-2 text-sm">
                    <p>{values.text}</p>
                    <p>
                      {values.category} · {values.priority}
                    </p>
                    <p>{values.keywords}</p>
                    {passages.map((p) => (
                      <blockquote key={p.start}>{p.quote}</blockquote>
                    ))}
                  </div>
                }
                onReload={onClose}
              />
              <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
                {requirement && (
                  <Button
                    type="button"
                    className="mr-auto"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => setRemove(true)}
                  >
                    Remove requirement
                  </Button>
                )}
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={mutation.isPending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  disabled={mutation.isPending || !values.text.trim() || !values.category.trim()}
                >
                  {mutation.isPending ? "Saving…" : "Save requirement"}
                </Button>
              </div>
            </form>
          )}
        </EvidenceDialog>
      )}
    </form.Subscribe>
  );
}
function PostingQuote({
  snapshot,
  onCancel,
  onAdd,
}: {
  snapshot: JobDetail["snapshot"];
  onCancel: () => void;
  onAdd: (passage: typeof PostingPassage.Type) => void;
}) {
  const [quote, setQuote] = useState("");
  const [offset, setOffset] = useState<number | null>(null);
  const matches: number[] = [];
  if (quote) {
    let position = snapshot.text.indexOf(quote);
    while (position !== -1 && matches.length < 100) {
      matches.push(position);
      position = snapshot.text.indexOf(quote, position + 1);
    }
  }
  const selected = offset ?? (matches.length === 1 ? matches[0] : null);
  const valid =
    selected !== null &&
    selected !== undefined &&
    snapshot.text.slice(selected, selected + quote.length) === quote &&
    quote.length <= 4000;
  return (
    <div className="space-y-5">
      <FormField label="Saved posting">
        <Textarea
          readOnly
          className="h-52 font-mono text-sm"
          value={snapshot.text}
          onSelect={(event) => {
            const node = event.currentTarget;
            if (node.selectionEnd > node.selectionStart) {
              setQuote(snapshot.text.slice(node.selectionStart, node.selectionEnd));
              setOffset(node.selectionStart);
            }
          }}
        />
      </FormField>
      <FormField label="Exact passage">
        <Textarea
          value={quote}
          maxLength={4000}
          onChange={(event) => {
            setQuote(event.target.value);
            setOffset(null);
          }}
        />
      </FormField>
      {quote && !matches.length && (
        <p role="alert" className="text-sm text-destructive">
          This quote does not occur in the saved posting.
        </p>
      )}
      {matches.length > 1 && (
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">Choose the occurrence</legend>
          {matches.map((start) => (
            <label
              key={start}
              className="flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm"
            >
              <input
                type="radio"
                name="posting-occurrence"
                className="mt-1 size-4"
                checked={selected === start}
                onChange={() => setOffset(start)}
              />
              <span>
                Line {snapshot.text.slice(0, start).split("\n").length} · offsets {start}–
                {start + quote.length}
                <span className="mt-2 block whitespace-pre-wrap text-muted-foreground">
                  {snapshot.text.slice(
                    Math.max(0, start - 50),
                    Math.min(snapshot.text.length, start + quote.length + 50),
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {matches.length === 100 && (
        <p className="text-sm">
          Showing the first 100 occurrences. Select the passage directly in the posting to narrow
          it.
        </p>
      )}
      <div className="flex justify-end gap-3 border-t pt-5">
        <Button variant="outline" onClick={onCancel}>
          Back to requirement
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            if (valid && selected !== null && selected !== undefined)
              onAdd({
                snapshotId: snapshot.id,
                quote,
                start: selected,
                end: selected + quote.length,
              });
          }}
        >
          Add passage
        </Button>
      </div>
    </div>
  );
}
