import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const JobTargets = lazy(() => import("~/components/workspace/jobs"));
export const Route = createFileRoute("/jobs_/$jobId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: () => (
    <WorkspaceShell {...Route.useRouteContext()}>
      <Suspense fallback={<p className="p-10">Loading job targets…</p>}>
        <JobTargets id={Route.useParams().jobId} />
      </Suspense>
    </WorkspaceShell>
  ),
});
