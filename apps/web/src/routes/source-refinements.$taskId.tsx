import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Failure, unwrap } from "~/components/evidence/shared";
import { SourceReview } from "~/components/refinement/review";
import { Button } from "~/components/ui/button";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";
import { getSourceRefinement } from "~/server/refinement-functions";

export const Route = createFileRoute("/source-refinements/$taskId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: SourceRefinementPage,
});
function SourceRefinementPage() {
  const session = Route.useRouteContext(),
    { taskId } = Route.useParams();
  const query = useQuery({
    queryKey: ["source-refinements", "detail", taskId],
    queryFn: async () => unwrap(await getSourceRefinement({ data: { id: taskId } })),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.proposal?.state === "Pending" ||
        (d?.operation && ["Pending", "Running"].includes(d.operation.state))
        ? 3000
        : false;
    },
  });
  return (
    <WorkspaceShell {...session}>
      <div className="space-y-6 p-5 md:p-8">
        <Failure error={query.error} />
        {query.isPending && <p role="status">Loading saved source refinement…</p>}
        {query.error && <Button onClick={() => void query.refetch()}>Retry saved review</Button>}
        {query.data && <SourceReview key={taskId} detail={query.data} />}
      </div>
    </WorkspaceShell>
  );
}
