import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const Sources = lazy(() => import("~/components/workspace/sources"));
export const Route = createFileRoute("/sources")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: () => {
    const session = Route.useRouteContext();
    return (
      <WorkspaceShell {...session}>
        <Suspense fallback={<p className="p-10">Loading sources…</p>}>
          <Sources />
        </Suspense>
      </WorkspaceShell>
    );
  },
});
