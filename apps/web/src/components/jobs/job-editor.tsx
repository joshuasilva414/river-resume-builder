import { useForm } from "@tanstack/react-form";
import { EvidenceDialog, FormField } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { JobConflict, type JobDetail, useJobCommand } from "./shared";

type Mode = "create" | "details" | "snapshot" | "archive";
export function JobEditor({
  mode,
  detail,
  onClose,
  onSaved,
}: {
  mode: Mode;
  detail?: JobDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const mutation = useJobCommand((outcome) => {
    onSaved(outcome.id);
    onClose();
  });
  const archived = detail?.job.archivedAt !== null && detail?.job.archivedAt !== undefined;
  const title =
    mode === "create"
      ? "Add job target"
      : mode === "details"
        ? "Edit job details"
        : mode === "snapshot"
          ? "Add posting snapshot"
          : archived
            ? "Restore job target"
            : "Archive job target";
  const form = useForm({
    defaultValues: {
      details: detail?.job.details ?? { role: "", company: "", location: "" },
      text: "",
      url: "",
      rationale: "",
    },
    onSubmit: async ({ value }) => {
      if (mode === "create")
        await mutation
          .mutateAsync({
            type: "create",
            details: value.details,
            posting: { text: value.text, url: value.url.trim() || null },
          })
          .catch(() => {});
      else if (detail) {
        const base = { id: detail.job.id, revision: detail.job.revision };
        if (mode === "details")
          await mutation
            .mutateAsync({ ...base, type: "details", details: value.details })
            .catch(() => {});
        else if (mode === "snapshot")
          await mutation
            .mutateAsync({
              ...base,
              type: "snapshot",
              posting: { text: value.text, url: value.url.trim() || null },
            })
            .catch(() => {});
        else
          await mutation
            .mutateAsync({
              ...base,
              type: "archive",
              archived: !archived,
              rationale: value.rationale,
            })
            .catch(() => {});
      }
    },
  });
  return (
    <form.Subscribe selector={(state) => [state.values, state.isDirty] as const}>
      {([values, dirty]) => (
        <EvidenceDialog
          title={title}
          description={
            mode === "create"
              ? "Save the complete posting, then choose the requirements and supporting evidence."
              : mode === "details"
                ? "Update the display details. Earlier posting snapshots keep their captured values."
                : mode === "snapshot"
                  ? "The new posting starts an empty requirement map and selection. Earlier work remains in posting history."
                  : "Posting snapshots, requirements, and selected evidence are preserved."
          }
          onClose={onClose}
          dirty={dirty}
          className={mode === "snapshot" ? "sm:max-w-[616px]" : "sm:max-w-[448px]"}
          pending={mutation.isPending}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            {(mode === "create" || mode === "details") &&
              (["role", "company", "location"] as const).map((name) => (
                <form.Field key={name} name={`details.${name}`}>
                  {(field) => (
                    <FormField
                      label={
                        name === "role"
                          ? "Role title"
                          : name === "company"
                            ? "Company"
                            : "Location (optional)"
                      }
                    >
                      <Input
                        maxLength={200}
                        required={name !== "location"}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FormField>
                  )}
                </form.Field>
              ))}
            {(mode === "create" || mode === "snapshot") && (
              <>
                <form.Field name="text">
                  {(field) => (
                    <FormField label="Complete posting text">
                      <Textarea
                        className="min-h-48"
                        required
                        maxLength={200000}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FormField>
                  )}
                </form.Field>
                <form.Field name="url">
                  {(field) => (
                    <FormField label="Posting URL (optional)">
                      <Input
                        type="url"
                        maxLength={2048}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </FormField>
                  )}
                </form.Field>
                <p className="text-sm text-muted-foreground">
                  The URL records where the posting came from. River saves the text you paste.
                </p>
              </>
            )}
            {mode === "archive" && (
              <form.Field name="rationale">
                {(field) => (
                  <FormField label="Reason">
                    <Textarea
                      required
                      maxLength={4000}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </FormField>
                )}
              </form.Field>
            )}
            <JobConflict
              error={mutation.error}
              id={detail?.job.id ?? ""}
              local={
                <div className="space-y-2 whitespace-pre-wrap text-sm">
                  <p>
                    {values.details.role} · {values.details.company}
                  </p>
                  <p>{values.details.location}</p>
                  <p>{values.text || values.rationale}</p>
                  <p>{values.url}</p>
                </div>
              }
              onReload={onClose}
            />
            <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={mutation.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={
                  mutation.isPending ||
                  ((mode === "create" || mode === "details") &&
                    (!values.details.role.trim() || !values.details.company.trim())) ||
                  ((mode === "create" || mode === "snapshot") && !values.text.trim()) ||
                  (mode === "archive" && !values.rationale.trim())
                }
              >
                {mutation.isPending ? "Saving…" : mode === "create" ? "Create job target" : title}
              </Button>
            </div>
          </form>
        </EvidenceDialog>
      )}
    </form.Subscribe>
  );
}
