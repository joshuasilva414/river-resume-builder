import type { CaptureCheckpointRequest } from "@river/contracts";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { captureResumeCheckpoint } from "~/server/checkpoint-functions";

export { CheckpointHistory } from "~/components/history/chronology";

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
  const [label, setLabel] = useState("");
  const request = useRef<CaptureCheckpointRequest | null>(null);
  const capture = useMutation({
    mutationFn: async () => {
      request.current ??= {
        id,
        revision,
        idempotencyKey: crypto.randomUUID(),
        ...(label.trim() ? { label: label.trim() } : {}),
      };
      return unwrap(await captureResumeCheckpoint({ data: request.current }));
    },
    onSuccess: (result) =>
      void navigate({
        to: "/checkpoints/$checkpointId",
        params: { checkpointId: result.id },
      }),
  });
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!waiting && !capture.isPending) capture.mutate();
      }}
    >
      <FormField label="Version name (optional)">
        <Input
          maxLength={80}
          value={label}
          disabled={!!request.current}
          placeholder="Review before submission"
          onChange={(event) => setLabel(event.target.value)}
        />
      </FormField>
      {waiting && (
        <p role="status" className="text-sm text-muted-foreground">
          Waiting for your changes to save…
        </p>
      )}
      <Failure error={capture.error} />
      <div className="flex justify-end">
        <Button disabled={waiting || capture.isPending}>
          {capture.isPending && <LoaderCircle className="animate-spin" />}
          {capture.isPending ? "Saving version…" : capture.error ? "Retry saving" : "Save version"}
        </Button>
      </div>
    </form>
  );
}
