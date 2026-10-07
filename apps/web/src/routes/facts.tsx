import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const FactBank = lazy(() => import("~/components/workspace/fact-bank"));
export const Route = createFileRoute("/facts")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: () => {
    const session = Route.useRouteContext();
    return (
      <WorkspaceShell {...session}>
        <Suspense fallback={<p className="p-10">Loading Fact Bank…</p>}>
          <FactBank />
        </Suspense>
      </WorkspaceShell>
    );
  },
});
