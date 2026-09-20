import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const FactImport = lazy(() => import("~/components/workspace/fact-import"));
export const Route = createFileRoute("/facts_/import")({
  validateSearch: (search: Record<string, unknown>) => ({
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: () => {
    const session = Route.useRouteContext();
    return (
      <WorkspaceShell {...session}>
        <Suspense fallback={<p className="p-10">Loading import…</p>}>
          <FactImport sourceId={Route.useSearch().source} />
        </Suspense>
      </WorkspaceShell>
    );
  },
});
