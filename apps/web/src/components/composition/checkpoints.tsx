import type { CaptureCheckpointRequest } from "@river/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { RestoreCheckpoint } from "~/components/history/restore";
import { ScoringAllowance, useScoringAllowance } from "~/components/scoring/allowance";
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
  const navigate = useNavigate(),
    allowance = useScoringAllowance(),
    client = useQueryClient();
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
      void client.invalidateQueries({ queryKey: ["scoring-allowance"] });
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
      <h3 className="font-editorial text-2xl">Save a version</h3>
      <p className="text-sm text-muted-foreground">
        Save a version to preserve this résumé and its supporting information. River prepares its
        export files after saving.
      </p>
      <p className="eyebrow">
        {waiting ? "Waiting for your changes to save" : "All changes saved"}
      </p>
      <FormField label="Version name (optional)">
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
            Version saved. Its PDF will be ready when document preparation finishes.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex min-h-11 items-center text-sm text-primary underline"
              target="_blank"
              rel="noreferrer"
              to="/checkpoints/$checkpointId"
              params={{ checkpointId: captured }}
            >
              Open saved version
            </Link>
            <Button variant="outline" onClick={() => setBranch(true)}>
              Create an editable copy
            </Button>
          </div>
        </div>
      ) : mode && capture.error ? (
        <Button disabled={waiting || capture.isPending} onClick={() => capture.mutate(mode)}>
          Retry saving
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button disabled={waiting || !!mode} onClick={() => capture.mutate("save")}>
            {capture.isPending && <LoaderCircle className="animate-spin" />}
            {capture.isPending ? "Saving version…" : "Save version"}
          </Button>
          <Button
            variant="outline"
            disabled={waiting || !!mode}
            onClick={() => capture.mutate("export")}
          >
            Save & review PDF
          </Button>
          <Button
            variant="outline"
            disabled={waiting || !!mode}
            onClick={() => capture.mutate("branch")}
          >
            Save & create a copy
          </Button>
          {settings.data?.configured && (
            <Button
              variant="outline"
              disabled={
                waiting ||
                !!mode ||
                (allowance.data?.remaining !== null && (allowance.data?.remaining ?? 0) < 1)
              }
              onClick={() => capture.mutate("score")}
            >
              Save & score
            </Button>
          )}
        </div>
      )}
      {settings.data?.configured && <ScoringAllowance />}
      {settings.error && (
        <p className="text-xs text-muted-foreground">
          Scoring availability could not be checked. You can still save and export your résumé.
        </p>
      )}
      {branch && captured && (
        <RestoreCheckpoint checkpointId={captured} onClose={() => setBranch(false)} />
      )}
    </section>
  );
}
