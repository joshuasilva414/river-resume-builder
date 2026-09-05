import type { CaptureCheckpointRequest } from "@river/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { RestoreCheckpoint } from "~/components/history/restore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { captureResumeCheckpoint } from "~/server/checkpoint-functions";
import { captureAndScoreCheckpoint, getScoringSettings } from "~/server/scoring-functions";

export { CheckpointHistory } from "~/components/history/chronology";

type CaptureMode = "export" | "score" | "save" | "branch";
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
  const [mode, setMode] = useState<CaptureMode | null>(null),
    [label, setLabel] = useState("");
  const [captured, setCaptured] = useState<string | null>(null),
    [branch, setBranch] = useState(false);
  const request = useRef<CaptureCheckpointRequest | null>(null);
  const capture = useMutation({
    mutationFn: async (chosen: CaptureMode) => {
      const selected = mode ?? chosen;
      setMode(selected);
      request.current ??= {
        id,
        revision,
        idempotencyKey: crypto.randomUUID(),
        ...(label.trim() ? { label: label.trim() } : {}),
      };
      const result = unwrap(
        selected === "score"
          ? await captureAndScoreCheckpoint({ data: request.current })
          : await captureResumeCheckpoint({ data: request.current }),
      );
      return { ...result, mode: selected };
    },
    onSuccess: (result) => {
      setCaptured(result.id);
      if (result.mode === "branch") setBranch(true);
      if (result.mode === "export" || result.mode === "score")
        void navigate({
          to: "/checkpoints/$checkpointId",
          params: { checkpointId: result.id },
          search: result.mode === "score" ? { scores: true } : {},
        });
    },
  });
  return (
    <section className="mt-6 space-y-4 border-t pt-5">
      <h3 className="font-editorial text-2xl">Save checkpoint</h3>
      <p className="text-sm text-muted-foreground">
        Capture the exact saved composition, evidence, contact, context and template references.
        Document preparation continues after the checkpoint is saved.
      </p>
      <p className="eyebrow">
        Draft revision {revision} ·{" "}
        {waiting ? "Waiting for save or conflict recovery" : "All changes saved"}
      </p>
      <FormField label="Checkpoint label (optional)">
        <Input
          maxLength={80}
          value={label}
          disabled={!!mode}
          placeholder="Review before submission"
          onChange={(event) => setLabel(event.target.value)}
        />
      </FormField>
      <Failure error={capture.error} />
      {captured ? (
        <div className="space-y-3 rounded-md border bg-primary/5 p-4">
          <p role="status">
            Checkpoint {captured.slice(-8)} saved. Its document can finish or be retried
            independently.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex min-h-11 items-center text-sm text-primary underline"
              target="_blank"
              rel="noreferrer"
              to="/checkpoints/$checkpointId"
              params={{ checkpointId: captured }}
            >
              Open checkpoint
            </Link>
            <Button variant="outline" onClick={() => setBranch(true)}>
              Create a branch from this checkpoint
            </Button>
          </div>
        </div>
      ) : mode && capture.error ? (
        <Button disabled={waiting || capture.isPending} onClick={() => capture.mutate(mode)}>
          Retry checkpoint command
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button disabled={waiting || !!mode} onClick={() => capture.mutate("save")}>
            {capture.isPending ? "Saving checkpoint…" : "Save checkpoint"}
          </Button>
          <Button
            variant="outline"
            disabled={waiting || !!mode}
            onClick={() => capture.mutate("export")}
          >
            Capture & review export
          </Button>
          <Button
            variant="outline"
            disabled={waiting || !!mode}
            onClick={() => capture.mutate("branch")}
          >
            Save checkpoint & branch
          </Button>
          {settings.data?.configured && (
            <Button
              variant="outline"
              disabled={waiting || !!mode}
              onClick={() => capture.mutate("score")}
            >
              Save & score
            </Button>
          )}
        </div>
      )}
      {settings.error && (
        <p className="text-xs text-muted-foreground">
          Scoring availability could not be checked. Checkpoint capture and export remain available.
        </p>
      )}
      {branch && captured && (
        <RestoreCheckpoint checkpointId={captured} onClose={() => setBranch(false)} />
      )}
    </section>
  );
}
