import {
  type FeedbackKind,
  type FeedbackStatus,
  feedbackKinds,
  feedbackStatuses,
  type SubmitFeedbackRequest,
  type UpdateFeedbackRequest,
} from "@river/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { type getFeedback, saveFeedbackUpdate, sendFeedback } from "~/server/feedback-functions";

export type FeedbackReport = Extract<
  Awaited<ReturnType<typeof getFeedback>>,
  { ok: true }
>["value"]["items"][number];

export function FeedbackForm({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const client = useQueryClient();
  const [kind, setKind] = useState<FeedbackKind>("Bug report");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const pending = useRef<SubmitFeedbackRequest | null>(null);
  const submit = useMutation({
    mutationFn: async (data: SubmitFeedbackRequest) => {
      const result = await sendFeedback({ data });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => {
      pending.current = null;
      setTitle("");
      setDescription("");
      void client.invalidateQueries({ queryKey: ["feedback"] });
      onSuccess();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!submit.isPending) onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-160"
        showCloseButton={!submit.isPending}
      >
        <DialogHeader>
          <DialogTitle>New feedback</DialogTitle>
          <DialogDescription>
            Report a problem or suggest an improvement to River.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (submit.isPending) return;
            const fields = { kind, title: title.trim(), description: description.trim() };
            if (
              !pending.current ||
              pending.current.kind !== fields.kind ||
              pending.current.title !== fields.title ||
              pending.current.description !== fields.description
            )
              pending.current = { ...fields, idempotencyKey: crypto.randomUUID() };
            submit.mutate(pending.current);
          }}
        >
          <fieldset disabled={submit.isPending} className="flex flex-col gap-6">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Type</legend>
              <div className="flex flex-wrap gap-2">
                {feedbackKinds.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2.5 text-sm has-checked:border-primary has-checked:text-primary"
                  >
                    <input
                      type="radio"
                      name="feedback-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <label htmlFor="feedback-title" className="flex flex-col gap-2 text-sm font-semibold">
              Title
              <Input
                id="feedback-title"
                value={title}
                required
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <label htmlFor="feedback-description" className="font-semibold">
                Description
              </label>
              <p id="feedback-description-help" className="text-muted-foreground">
                {kind === "Bug report"
                  ? "Include steps to reproduce, what you expected, and what happened instead."
                  : "Describe the problem you want to solve, your proposed change, and how it would help."}
              </p>
              <Textarea
                id="feedback-description"
                aria-describedby="feedback-description-help feedback-description-count"
                className="min-h-40"
                value={description}
                required
                maxLength={12000}
                onChange={(event) => setDescription(event.target.value)}
              />
              <span id="feedback-description-count" className="text-xs text-muted-foreground">
                {description.length.toLocaleString()} / 12,000 characters
              </span>
            </div>
          </fieldset>
          <p className="text-sm leading-5.5 text-muted-foreground">
            Your feedback will be shared with the River administrator. Don’t include passwords, API
            keys, or sensitive résumé details.
          </p>
          {submit.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {submit.error.message} Your input is preserved; you can retry.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submit.isPending || !title.trim() || !description.trim()}
            >
              {submit.isPending ? "Submitting…" : "Submit feedback"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackUpdate({
  report,
  onClose,
  onSuccess,
}: {
  report: FeedbackReport;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const client = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(report.status);
  const [response, setResponse] = useState(report.response);
  const pending = useRef<UpdateFeedbackRequest | null>(null);
  const update = useMutation({
    mutationFn: async (data: UpdateFeedbackRequest) => {
      const result = await saveFeedbackUpdate({ data });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["feedback"] });
      onSuccess();
    },
  });
  return (
    <form
      className="flex flex-col gap-4 border-t pt-5"
      aria-label={`Update ${report.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (update.isPending) return;
        const trimmed = response.trim();
        if (
          !pending.current ||
          pending.current.status !== status ||
          pending.current.response !== trimmed
        )
          pending.current = {
            id: report.id,
            revision: report.revision,
            status,
            response: trimmed,
            idempotencyKey: crypto.randomUUID(),
          };
        update.mutate(pending.current);
      }}
    >
      <label htmlFor="feedback-status" className="flex flex-col gap-2 text-sm font-semibold">
        Status
        <select
          id="feedback-status"
          className="h-10 rounded-sm border bg-background px-3 font-normal sm:w-55"
          value={status}
          disabled={update.isPending}
          onChange={(event) => {
            const selected = feedbackStatuses.find((value) => value === event.target.value);
            if (selected) setStatus(selected);
          }}
        >
          {feedbackStatuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label htmlFor="feedback-response" className="flex flex-col gap-2 text-sm font-semibold">
        Response (optional)
        <Textarea
          id="feedback-response"
          className="min-h-26 font-normal"
          value={response}
          maxLength={4000}
          disabled={update.isPending}
          onChange={(event) => setResponse(event.target.value)}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        The person who submitted this report can see its status and your response.
      </p>
      {update.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {update.error.message} Your edits are preserved. If the report changed, copy your
            response, cancel, and refresh the list before editing again.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save update"}
        </Button>
        <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
