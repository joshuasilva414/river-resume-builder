import type { RetryBackupRequest } from "@river/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cancelDocumentOperation, getBackupStatus, retryDailyBackup } from "~/server/functions";

const procedure = "docs/implementation/recovery.md";
const time = (value: number) => new Date(value).toLocaleString();

export function BackupSettings() {
  const client = useQueryClient();
  const [before, setBefore] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pending = useRef<RetryBackupRequest | null>(null);
  const cancellation = useRef<{ operationId: string; idempotencyKey: string } | null>(null);
  const status = useQuery({
    queryKey: ["backup-status", before, date],
    queryFn: async () => {
      const result = await getBackupStatus({ data: { before, date } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    refetchInterval: (query) =>
      ["Pending", "Running"].includes(query.state.data?.latest?.state ?? "") ? 5000 : 30_000,
  });
  const retry = useMutation({
    mutationFn: async (input: RetryBackupRequest) => {
      const result = await retryDailyBackup({ data: input });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: (value) => {
      setInspection(value.id);
      setDate(null);
      pending.current = null;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["backup-status"] }),
  });
  const cancel = useMutation({
    mutationFn: async (operationId: string) => {
      if (cancellation.current?.operationId !== operationId)
        cancellation.current = { operationId, idempotencyKey: crypto.randomUUID() };
      const result = await cancelDocumentOperation({ data: cancellation.current });
      if (!result.ok) throw Error(result.error.title);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["backup-status"] }),
  });
  const value = status.data,
    latest = value?.latest;
  const selected = value?.attempts.find((item) => item.id === inspection) ?? value?.attempts.at(-1);
  const selectedNumber = selected
    ? (value?.attempts.findIndex((item) => item.id === selected.id) ?? -1) + 1
    : null;
  const busy = retry.isPending || cancel.isPending;
  const current = Boolean(value && !status.isError && !status.isFetching);
  const active = latest && ["Pending", "Running"].includes(latest.state);
  const retryable =
    latest &&
    ["Failed", "Cancelled"].includes(latest.state) &&
    latest.attempt < (value?.maxAttempts ?? 3);
  async function copy(label: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(label);
    } catch {
      setCopied("Copy unavailable in this browser");
    }
  }
  return (
    <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_404px]">
      <section className="flex min-w-0 flex-col gap-6 px-5 py-7 md:px-8 lg:border-r">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-semibold tracking-tight">Daily backups</h2>
            <p className="mt-2 text-muted-foreground">
              Status and recovery for your personal workspace.
            </p>
          </div>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            Refresh status
          </Button>
        </div>
        {status.isPending && <p role="status">Loading backup status…</p>}
        {status.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Backup status could not be refreshed. Previously loaded details may be stale.{" "}
              {status.error.message}
            </AlertDescription>
          </Alert>
        )}
        {(retry.error || cancel.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {retry.error?.message ?? cancel.error?.message} Refresh status before another action.
            </AlertDescription>
          </Alert>
        )}
        {value && !value.configured && (
          <Alert>
            <AlertDescription>
              Daily backup execution is unavailable in this environment. The dedicated credential
              and personal staging settings must be configured before retrying. Saved history
              remains available.
            </AlertDescription>
          </Alert>
        )}
        {value && !latest && <p>No daily backup has been scheduled yet.</p>}
        {latest && (
          <>
            <div className="flex flex-col gap-4 rounded-sm border p-5" role="status">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{latest.state}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  Latest daily date · {latest.date} UTC
                </span>
              </div>
              <h3 className="text-xl font-semibold">
                {latest.state === "Succeeded"
                  ? "Daily backup completed"
                  : latest.state === "Failed"
                    ? "Daily backup needs attention"
                    : latest.state === "Cancelled"
                      ? "Daily backup cancelled"
                      : "Daily backup in progress"}
              </h3>
              <p>Stage: {latest.stage}</p>
              <p className="text-muted-foreground">
                Attempt {latest.attempt} of {value?.maxAttempts} · Updated {time(latest.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {retryable && (
                <Button
                  className="min-h-11"
                  disabled={!current || !value?.configured || busy}
                  onClick={() => {
                    if (
                      pending.current?.date !== latest.date ||
                      pending.current.attempt !== latest.attempt
                    )
                      pending.current = {
                        date: latest.date,
                        attempt: latest.attempt,
                        idempotencyKey: crypto.randomUUID(),
                      };
                    retry.mutate(pending.current);
                  }}
                >
                  {retry.isPending
                    ? "Requesting retry…"
                    : latest.state === "Failed"
                      ? "Retry failed backup"
                      : "Retry backup"}
                </Button>
              )}
              {active && (
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={!current || busy}
                  onClick={() => cancel.mutate(latest.operationId)}
                >
                  {cancel.isPending ? "Cancellation requested…" : "Cancel backup"}
                </Button>
              )}
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => {
                  setDate(latest.date);
                  setInspection(latest.operationId);
                }}
              >
                Inspect latest attempt
              </Button>
            </div>
            {retryable && (
              <p className="text-sm text-muted-foreground">
                Retry creates attempt {latest.attempt + 1} for {latest.date} UTC. Previous attempts
                and their artifacts remain in history.
              </p>
            )}
            {latest.attempt >= (value?.maxAttempts ?? 3) &&
              ["Failed", "Cancelled"].includes(latest.state) && (
                <Alert>
                  <AlertDescription>
                    Daily attempt limit reached. This date will not run again automatically. The
                    next UTC date has a separate scheduled backup.
                  </AlertDescription>
                </Alert>
              )}
          </>
        )}
      </section>
      <aside
        aria-label="Backup attempt details"
        className="row-start-2 flex min-w-0 flex-col gap-5 border-y bg-muted/40 p-5 md:p-7 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:border-y-0"
      >
        <h2 className="text-[28px]">Attempt details</h2>
        {selected ? (
          <>
            <Badge variant="outline" className="self-start">
              {selected.state}
            </Badge>
            <p className="font-mono text-xs text-muted-foreground">
              {value?.selectedDate} UTC · Attempt {selectedNumber} of {value?.maxAttempts}
            </p>
            <dl className="grid gap-2">
              <dt className="font-medium">Operation</dt>
              <dd className="break-all font-mono text-xs">{selected.id}</dd>
              <dt className="font-medium">Stage</dt>
              <dd>{selected.stage}</dd>
              <dt className="font-medium">Started</dt>
              <dd className="text-sm">{time(selected.createdAt)}</dd>
              <dt className="font-medium">Updated</dt>
              <dd className="text-sm">{time(selected.updatedAt)}</dd>
            </dl>
            {selected.failure && (
              <div>
                <h3 className="mb-3 font-sans text-base font-semibold">Safe failure details</h3>
                <p className="text-sm leading-6">{selected.failure}</p>
              </div>
            )}
            <Button
              className="min-h-11"
              variant="outline"
              onClick={() =>
                void copy(
                  "Diagnostic details copied",
                  JSON.stringify(
                    {
                      date: value?.selectedDate,
                      attempt: selectedNumber,
                      maxAttempts: value?.maxAttempts,
                      ...selected,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Copy safe diagnostic details
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Select a saved attempt to inspect its status.</p>
        )}
        <div className="border-t pt-5">
          <h3 className="font-sans text-base font-semibold">Restore procedure</h3>
          <p className="my-4 text-sm leading-6 text-muted-foreground">
            An operator verifies the retained backup and restores into isolated resources before any
            cutover.
          </p>
          <details className="rounded-sm border bg-background p-4">
            <summary className="cursor-pointer font-medium">
              View operator restore procedure
            </summary>
            <p className="my-4 break-words font-mono text-xs">{procedure}</p>
            <Button
              className="min-h-11 w-full"
              variant="outline"
              onClick={() => void copy("Procedure reference copied", procedure)}
            >
              Copy procedure reference
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">
              Use the Backup and Isolated restore drill sections in the River repository.
            </p>
          </details>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Daily database backups expire after 30 days. Original sources and checkpoint files
            remain in retained storage.
          </p>
        </div>
        {copied && (
          <p role="status" className="text-sm">
            {copied}
          </p>
        )}
      </aside>
      <section className="row-start-3 flex min-w-0 flex-col gap-3 border-b px-5 py-6 md:px-8 lg:col-start-1 lg:row-start-2 lg:border-r">
        <h2 className="text-xl">Last retained daily backup</h2>
        {value &&
          (value.retained ? (
            <>
              <p className="font-medium">{value.retained.date} UTC</p>
              <p>Completed {time(value.retained.completedAt)}</p>
              <p className="text-muted-foreground">Expires {time(value.retained.expiresAt)}</p>
              <details>
                <summary className="cursor-pointer text-sm">Retained artifact metadata</summary>
                <dl className="mt-3 grid gap-2 text-sm">
                  <dt>Format</dt>
                  <dd>{value.retained.format}</dd>
                  <dt>SQL bytes</dt>
                  <dd>{value.retained.bytes.toLocaleString()}</dd>
                  <dt>SHA-256</dt>
                  <dd className="break-all font-mono text-xs">{value.retained.sha256}</dd>
                </dl>
              </details>
            </>
          ) : (
            <>
              <p className="font-medium">None yet</p>
              <p className="text-muted-foreground">
                No completed daily backup currently has available, unexpired artifacts.
              </p>
            </>
          ))}
        <p className="text-sm text-muted-foreground">
          A retained backup still requires an isolated restore drill before release.
        </p>
      </section>
      <section className="row-start-4 flex min-w-0 flex-col gap-5 px-5 py-6 md:px-8 lg:col-start-1 lg:row-start-3 lg:border-r">
        <h2 className="text-xl">Backup history</h2>
        {value?.dates.map((day) => (
          <div key={day.date} className="flex flex-wrap items-center gap-3 border-b pb-3">
            <span className="min-w-36 flex-1 font-mono text-sm">{day.date} UTC</span>
            <Badge variant="outline">{day.state}</Badge>
            <Button
              className="min-h-11 w-28"
              variant="outline"
              onClick={() => {
                setDate(day.date);
                setInspection(null);
              }}
            >
              View attempts
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          {before && (
            <Button variant="outline" onClick={() => setBefore(null)}>
              Latest dates
            </Button>
          )}
          {value?.nextBefore && (
            <Button variant="outline" onClick={() => setBefore(value.nextBefore)}>
              Earlier dates
            </Button>
          )}
        </div>
        {value?.attempts.length ? (
          <>
            <h3 className="font-sans text-base font-medium">{value.selectedDate} UTC · Attempts</h3>
            <ol className="flex flex-col gap-4">
              {value.attempts.map((item, index) => (
                <li key={item.id} className="flex flex-wrap items-start gap-3 border-b pb-4">
                  <div className="min-w-0 flex-1">
                    <p>
                      Attempt {index + 1} · {item.state}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {item.id}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{time(item.updatedAt)}</p>
                  </div>
                  <Button
                    className="min-h-11 w-28"
                    variant="outline"
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setInspection(item.id)}
                  >
                    Inspect {index + 1}
                  </Button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
    </div>
  );
}
