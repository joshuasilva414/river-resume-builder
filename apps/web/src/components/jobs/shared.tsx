import type { InspectJobRequest, JobCommand } from "@river/contracts";
import { type CommandOutcome, canonicalJson } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { Failure, RequestFailure, unwrap } from "~/components/evidence/shared";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { getJobDetail, mutateJob } from "~/server/job-functions";
export type JobDetail = Extract<Awaited<ReturnType<typeof getJobDetail>>, { ok: true }>["value"];
type WithoutKey<T> = T extends unknown ? Omit<T, "idempotencyKey"> : never;
export type JobInput = WithoutKey<JobCommand>;
export function useJobCommand(onSaved?: (outcome: CommandOutcome) => void) {
  const client = useQueryClient();
  const pending = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (input: JobInput) => {
      const payload = canonicalJson(input);
      if (pending.current?.payload !== payload)
        pending.current = { payload, key: crypto.randomUUID() };
      return unwrap(await mutateJob({ data: { ...input, idempotencyKey: pending.current.key } }));
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["jobs"] });
      onSaved?.(result);
    },
    onError: (error) => {
      if (error instanceof RequestFailure && error.problem.code === "Conflict")
        void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
export const useJobDetail = (input: InspectJobRequest, enabled = true) =>
  useQuery({
    queryKey: ["jobs", "detail", input],
    queryFn: async () => unwrap(await getJobDetail({ data: input })),
    enabled,
  });
export function JobSummary({ detail }: { detail: JobDetail }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">
        {detail.job.details.role} · {detail.job.details.company}
      </p>
      <p>{detail.job.details.location}</p>
      <p>
        Revision {detail.job.revision} · {detail.job.archivedAt ? "Archived" : "Active"}
      </p>
      <details>
        <summary className="cursor-pointer">
          Saved posting · {new Date(detail.snapshot.createdAt).toLocaleString()}
        </summary>
        <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap">{detail.snapshot.text}</p>
      </details>
      <ul className="space-y-2">
        {detail.workspace.data.requirements.map((r) => (
          <li key={r.id}>
            <p>
              {r.priority} · {r.category} · {r.text}
            </p>
            <p className="text-xs text-muted-foreground">
              Keywords: {r.keywords.join(", ") || "None"} · Interpretation confidence:{" "}
              {r.confidence === null ? "Unspecified" : `${r.confidence * 100}%`}
            </p>
            {r.passages.map((p) => (
              <blockquote
                key={`${p.start}:${p.end}`}
                className="mt-2 border-l-2 pl-3 whitespace-pre-wrap"
              >
                {p.quote}
                <p className="text-xs text-muted-foreground">
                  Offsets {p.start}–{p.end}
                </p>
              </blockquote>
            ))}
          </li>
        ))}
      </ul>
      <p>{detail.workspace.data.selections.length} saved evidence associations</p>
    </div>
  );
}
export function JobConflict({
  error,
  id,
  local,
  onReload,
}: {
  error: Error | null;
  id: string;
  local: ReactNode;
  onReload: () => void;
}) {
  const [compare, setCompare] = useState(false);
  const latest = useJobDetail({ id }, compare);
  if (!(error instanceof RequestFailure) || error.problem.code !== "Conflict")
    return <Failure error={error} />;
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>{error.message} Your local changes are still here.</AlertDescription>
      </Alert>
      <Button type="button" variant="outline" onClick={() => setCompare(!compare)}>
        {compare ? "Keep editing" : "Compare changes"}
      </Button>
      {compare && (
        <>
          <Failure error={latest.error} />
          {latest.data && (
            <div className="grid gap-5 border-y py-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-3">Your unsaved changes</p>
                {local}
              </div>
              <div>
                <p className="eyebrow mb-3">Saved version</p>
                <JobSummary detail={latest.data} />
                <Button
                  className="mt-4 whitespace-normal"
                  type="button"
                  variant="outline"
                  onClick={onReload}
                >
                  Discard local changes and reload
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
