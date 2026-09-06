import { canonicalJson } from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  EvidenceDialog,
  Failure,
  FormField,
  RequestFailure,
  unwrap,
} from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { archiveLibrary } from "~/server/library-functions";
import { kindLabels, type LibraryDetail } from "./shared";

export function LibraryLifecycleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: LibraryDetail["item"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const archived = item.archivedAt === null;
  const action = archived ? "Archive" : "Restore";
  const [rationale, setRationale] = useState("");
  const request = useRef<{ payload: string; key: string } | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const input = { id: item.id, revision: item.revision, archived, rationale: rationale.trim() };
      const payload = canonicalJson(input);
      if (request.current?.payload !== payload)
        request.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await archiveLibrary({ data: { ...input, idempotencyKey: request.current.key } }),
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["library"] });
      onSaved();
    },
    onError: (error) => {
      if (error instanceof RequestFailure && error.problem.code === "Conflict")
        void client.invalidateQueries({ queryKey: ["library"] });
    },
  });
  const conflict =
    mutation.error instanceof RequestFailure && mutation.error.problem.code === "Conflict";
  return (
    <EvidenceDialog
      title={`${action} ${kindLabels[item.kind].toLowerCase()}`}
      description={
        archived
          ? "Remove this item from active library lists. Existing résumés and checkpoints keep their saved content."
          : "Return this item to the active library with its saved content revision."
      }
      onClose={onClose}
      dirty={Boolean(rationale)}
      pending={mutation.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="font-semibold break-words">{item.label}</p>
        <FormField label="Reason">
          <Textarea
            required
            maxLength={4000}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            disabled={mutation.isPending}
          />
        </FormField>
        <p className="text-sm text-muted-foreground">
          This reason will appear in the item’s archive history.
        </p>
        <Failure error={mutation.error} />
        {conflict && (
          <p className="text-sm">
            Close this dialog and inspect the current item before trying again. Your reason is still
            here to copy.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending || !rationale.trim() || conflict}>
            {mutation.isPending ? "Saving…" : `${action} item`}
          </Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
