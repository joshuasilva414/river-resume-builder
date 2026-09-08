import type { SetTrashRequest, TrashKind } from "@river/contracts";
import type { CommandOutcome } from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { setTrashItem } from "~/server/trash-functions";

export const trashLabels: Record<TrashKind, string> = {
  source: "Source",
  evidence: "Evidence",
  job: "Job",
  content: "Content",
  block: "Entry",
  section: "Section",
  template: "Template",
};
type TrashChange = Omit<SetTrashRequest, "idempotencyKey"> & { label: string };
const TrashFeedbackContext = createContext<((change: TrashChange) => void) | null>(null);

export function useTrashFeedback() {
  const notify = useContext(TrashFeedbackContext);
  if (!notify) throw new Error("Trash actions require the workspace shell.");
  return notify;
}

/** Use the observed revision in the key so retries replay the original lifecycle command. */
function command(input: Omit<SetTrashRequest, "idempotencyKey">) {
  return {
    ...input,
    idempotencyKey: `trash:${input.kind}:${input.id}:${input.revision}:${input.archived}`,
  };
}
function useTrashCommand(
  onSuccess: (result: CommandOutcome, input: Omit<SetTrashRequest, "idempotencyKey">) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<SetTrashRequest, "idempotencyKey">) =>
      unwrap(await setTrashItem({ data: command(input) })),
    // Notify before invalidation can unmount the row that started this mutation.
    onSuccess,
    onSettled: async (_result, _error, input) => {
      const family =
        input.kind === "template"
          ? "templates"
          : input.kind === "source"
            ? "sources"
            : input.kind === "evidence"
              ? "evidence"
              : input.kind === "job"
                ? "jobs"
                : "library";
      await Promise.all([
        client.invalidateQueries({ queryKey: ["trash"] }),
        client.invalidateQueries({ queryKey: [family] }),
        ...(input.kind === "source" ? [client.invalidateQueries({ queryKey: ["source"] })] : []),
      ]);
    },
  });
}

export function TrashFeedbackProvider({ children }: { children: ReactNode }) {
  const [change, setChange] = useState<TrashChange | null>(null);
  const undo = useTrashCommand((result, input) =>
    setChange((current) =>
      current?.id === input.id && current.kind === input.kind && current.revision === input.revision
        ? { ...current, archived: input.archived, revision: result.revision }
        : current,
    ),
  );
  const notify = (next: TrashChange) => {
    undo.reset();
    setChange(next);
  };
  return (
    <TrashFeedbackContext.Provider value={notify}>
      {change && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/40 px-5 py-3"
          role="status"
        >
          <p className="min-w-0 flex-1 text-sm break-words">
            <span className="font-semibold">{change.label}</span>
            {change.archived
              ? " moved to Trash. Saved résumés are unchanged."
              : " restored and available for new work."}
          </p>
          <Button
            variant="outline"
            disabled={undo.isPending}
            onClick={() =>
              undo.mutate({
                id: change.id,
                kind: change.kind,
                revision: change.revision,
                archived: !change.archived,
              })
            }
          >
            {undo.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Undo
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/trash">View Trash</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss trash notification"
            onClick={() => setChange(null)}
          >
            <X />
          </Button>
          <div className="w-full">
            <Failure error={undo.error} />
          </div>
        </div>
      )}
      {children}
    </TrashFeedbackContext.Provider>
  );
}

/** Keeps Undo in the workspace shell even when a deleted row or inspector disappears. */
export function TrashAction({
  item,
  onChanged,
}: {
  item: {
    id: string;
    kind: TrashKind;
    label: string;
    revision: number;
    archivedAt: number | string | null;
  };
  onChanged?: () => void;
}) {
  const notify = useTrashFeedback();
  const mutation = useTrashCommand((result, input) => {
    notify({ ...input, label: item.label, revision: result.revision });
    onChanged?.();
  });
  const archived = item.archivedAt === null;
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={mutation.isPending}
        aria-label={`${archived ? "Delete" : "Restore"} ${item.label}`}
        onClick={() =>
          mutation.mutate({ id: item.id, kind: item.kind, revision: item.revision, archived })
        }
      >
        {mutation.isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : archived ? (
          <Trash2 />
        ) : (
          <RotateCcw />
        )}
        {archived ? "Delete" : "Restore"}
      </Button>
      <Failure error={mutation.error} />
    </div>
  );
}
