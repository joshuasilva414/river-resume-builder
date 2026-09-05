import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EvidenceDialog, Failure, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { captureResumeCheckpoint, getCheckpoints } from "~/server/checkpoint-functions";
import { captureAndScoreCheckpoint, getScoringSettings } from "~/server/scoring-functions";

export function CaptureCheckpoint({
  id,
  revision,
  waiting,
}: {
  id: string;
  revision: number;
  waiting: boolean;
}) {
  const navigate = useNavigate();
  const settings = useQuery({
    queryKey: ["scoring-settings"],
    queryFn: async () => unwrap(await getScoringSettings()),
  });
  const [mode, setMode] = useState<"export" | "score" | null>(null);
  const [request] = useState(() => ({ id, revision, idempotencyKey: crypto.randomUUID() }));
  const capture = useMutation({
    mutationFn: async (chosen: "export" | "score") => {
      const selected = mode ?? chosen;
      setMode(selected);
      const result = unwrap(
        selected === "score"
          ? await captureAndScoreCheckpoint({ data: request })
          : await captureResumeCheckpoint({ data: request }),
      );
      return { ...result, mode: selected };
    },
    onSuccess: (result) =>
      void navigate({
        to: "/checkpoints/$checkpointId",
        params: { checkpointId: result.id },
        search: result.mode === "score" ? { scores: true } : {},
      }),
  });
  return (
    <div className="mt-6 space-y-3 border-t pt-5">
      <p className="text-sm text-muted-foreground">
        Capture the exact saved revision before reviewing evidence and exporting. Later draft edits
        will not change this checkpoint.
      </p>
      <Failure error={capture.error} />
      <Button
        disabled={waiting || capture.isPending || mode === "score"}
        onClick={() => capture.mutate("export")}
      >
        {waiting
          ? "Waiting for save"
          : capture.isPending
            ? "Capturing checkpoint…"
            : capture.error
              ? "Retry checkpoint capture"
              : "Capture & review export"}
      </Button>
      {settings.data?.configured && (
        <Button
          className="ml-0 sm:ml-3"
          variant="outline"
          disabled={waiting || capture.isPending || mode === "export"}
          onClick={() => capture.mutate("score")}
        >
          {capture.isPending && mode === "score"
            ? "Capturing and queuing scoring…"
            : capture.error && mode === "score"
              ? "Retry Save & score"
              : "Save & score"}
        </Button>
      )}
      {settings.error && (
        <p className="text-xs text-muted-foreground">
          Scoring availability could not be checked. Export capture remains available.
        </p>
      )}
    </div>
  );
}
export function CheckpointHistory({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const [offset, setOffset] = useState(0);
  const result = useQuery({
    queryKey: ["checkpoints", "history", draftId, offset],
    queryFn: async () => unwrap(await getCheckpoints({ data: { draftId, offset } })),
  });
  return (
    <EvidenceDialog
      title="Export history"
      description="Newest checkpoint first. Opening history does not change your working draft."
      onClose={onClose}
    >
      <Failure error={result.error} />
      {result.isPending && <p role="status">Loading checkpoint history…</p>}
      {result.error && <Button onClick={() => void result.refetch()}>Retry history</Button>}
      {result.data?.items.map((item) => (
        <article key={item.id} className="space-y-2 border-b py-5">
          <p className="eyebrow">
            Checkpoint {item.id.slice(-8)} ·{" "}
            {item.exportedAt
              ? "Exported"
              : item.state === "Succeeded"
                ? "Needs review"
                : item.state}
          </p>
          <p className="text-sm">
            {new Date(item.createdAt).toLocaleString()} · Draft revision {item.draftRevision}
          </p>
          <Link
            className="text-sm text-primary underline"
            to="/checkpoints/$checkpointId"
            params={{ checkpointId: item.id }}
            onClick={onClose}
          >
            {item.exportedAt ? "Open saved files" : "Resume export review"}
          </Link>
        </article>
      ))}
      {result.data?.items.length === 0 && (
        <p>No checkpoints yet. Capture a saved draft to begin export review.</p>
      )}
      <div className="mt-5 flex gap-3">
        {offset > 0 && (
          <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - 50))}>
            Newer checkpoints
          </Button>
        )}
        {result.data?.hasMore && (
          <Button variant="outline" onClick={() => setOffset(offset + 50)}>
            Show earlier checkpoints
          </Button>
        )}
      </div>
    </EvidenceDialog>
  );
}
