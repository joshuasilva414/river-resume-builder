import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { PdfPreview } from "~/components/pdf-preview";
import { Button } from "~/components/ui/button";
import { getPreviewOperation } from "~/server/composition-functions";
import { cancelDocumentOperation } from "~/server/functions";

/** Debounce working-copy renders and retain the last successful PDF across failures. */
export function WorkingPreview({
  identity,
  request,
  onReady,
}: {
  identity: string | null;
  request: () => Promise<{ id: string }>;
  onReady?: (identity: string | null, id: string | null) => void;
}) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [attempt, setAttempt] = useState(0),
    [cancelled, setCancelled] = useState<string | null>(null);
  const [active, setActive] = useState<{ identity: string; id: string } | null>(null);
  const [last, setLast] = useState<{ identity: string; id: string } | null>(null);
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null),
    [starting, setStarting] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries must rerun the same content identity.
  useEffect(() => {
    readyRef.current?.(null, null);
    if (!identity || identity === cancelled) return;
    let current = true,
      operationId: string | null = null;
    const timer = window.setTimeout(() => {
      setStarting(true);
      setError(null);
      void requestRef
        .current()
        .then((result) => {
          operationId = result.id;
          if (current) {
            setActive({ identity, id: result.id });
            setStarting(false);
          } else
            void cancelDocumentOperation({
              data: { operationId: result.id, idempotencyKey: crypto.randomUUID() },
            }).catch(() => {});
        })
        .catch((problem: unknown) => {
          if (current) {
            setStarting(false);
            setError(problem instanceof Error ? problem : new Error("Preview failed. Try again."));
          }
        });
    }, 650);
    return () => {
      current = false;
      window.clearTimeout(timer);
      if (operationId)
        void cancelDocumentOperation({
          data: { operationId, idempotencyKey: crypto.randomUUID() },
        }).catch(() => {});
    };
  }, [identity, attempt, cancelled]);
  const operation = useQuery({
    queryKey: ["working-preview", active?.id],
    enabled: active !== null,
    queryFn: async () => {
      if (!active) throw new Error("Preview unavailable.");
      return unwrap(await getPreviewOperation({ data: { id: active.id } }));
    },
    refetchInterval: (query) =>
      query.state.data && ["Succeeded", "Failed", "Cancelled"].includes(query.state.data.state)
        ? false
        : 1000,
  });
  useEffect(() => {
    if (
      active &&
      active.identity === identity &&
      identity !== cancelled &&
      operation.data?.id === active.id &&
      operation.data.state === "Succeeded" &&
      operation.data.ready &&
      operation.data.validationPassed
    ) {
      setLast(active);
    }
  }, [active, identity, cancelled, operation.data]);
  const pending =
    starting ||
    (active?.identity === identity &&
      operation.data &&
      ["Pending", "Running"].includes(operation.data.state));
  const failed =
    operation.data?.id === active?.id &&
    (operation.data?.state === "Failed" ||
      (operation.data?.state === "Succeeded" && !operation.data.validationPassed));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">PDF preview</h3>
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {pending
            ? "Updating preview…"
            : cancelled === identity && identity
              ? "Cancelled"
              : last?.identity === identity && displayed === last.id
                ? "Current"
                : last
                  ? "Showing the last successful preview"
                  : "Preparing preview"}
        </p>
        {pending && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCancelled(identity);
              setStarting(false);
              if (active)
                void cancelDocumentOperation({
                  data: { operationId: active.id, idempotencyKey: crypto.randomUUID() },
                });
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      {last && (
        <PdfPreview
          url={`/api/artifacts/${last.id}/pdf`}
          onDisplayChange={(url, visible) => {
            if (url !== `/api/artifacts/${last.id}/pdf`) return;
            setDisplayed(visible ? last.id : null);
            if (visible && last.identity === identity && identity !== cancelled)
              readyRef.current?.(last.identity, last.id);
            else readyRef.current?.(null, null);
          }}
        />
      )}
      <Failure error={error ?? operation.error} />
      {failed && (
        <p role="alert" className="text-sm">
          {operation.data?.failure ?? "Preview failed."} Your changes and previous PDF are
          preserved.
        </p>
      )}
      {(error || failed || (identity && cancelled === identity)) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCancelled(null);
            setAttempt((value) => value + 1);
          }}
        >
          Retry preview
        </Button>
      )}
    </div>
  );
}
