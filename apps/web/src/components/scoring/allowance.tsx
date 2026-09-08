import { useQuery } from "@tanstack/react-query";
import { unwrap } from "~/components/evidence/shared";
import { getScoringAllowance } from "~/server/scoring-functions";

export function useScoringAllowance() {
  return useQuery({
    queryKey: ["scoring-allowance"],
    queryFn: async () => unwrap(await getScoringAllowance()),
    refetchInterval: (query) =>
      query.state.data?.reserved
        ? 3000
        : query.state.data
          ? Math.max(1000, new Date(query.state.data.resetsAt).getTime() - Date.now())
          : false,
  });
}
export function ScoringAllowance({ cost = 1 }: { cost?: number }) {
  const result = useScoringAllowance(),
    allowance = result.data;
  if (result.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading scoring allowance…
      </p>
    );
  if (result.error)
    return <p className="text-sm text-destructive">Scoring allowance could not be loaded.</p>;
  if (!allowance) return null;
  return (
    <aside className="space-y-2 rounded-lg border p-4" aria-label="Scoring allowance">
      <p className="text-sm font-semibold">
        {allowance.exempt
          ? "Unlimited scoring for administrators"
          : `${allowance.remaining} of ${allowance.limit} scoring results remaining`}
      </p>
      {!allowance.exempt && (
        <p className="text-xs text-muted-foreground">
          Resets at{" "}
          {new Date(allowance.resetsAt).toLocaleDateString(undefined, { timeZone: "UTC" })} · 00:00
          UTC. {allowance.reserved > 0 ? `${allowance.reserved} reserved for processing.` : ""}
        </p>
      )}
      {cost > 1 && (
        <p className="text-sm">
          This run scores {cost} samples. Each successful sample uses one result.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Attempts without a saved result do not use allowance. Reusing a saved result is free.
      </p>
      {!allowance.exempt && (allowance.remaining ?? 0) < cost && (
        <p className="text-sm text-destructive">
          There is not enough allowance for this run. Saved scores and exports remain available.
        </p>
      )}
    </aside>
  );
}
