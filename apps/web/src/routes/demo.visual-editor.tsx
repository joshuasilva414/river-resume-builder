/** DEMO ONLY: development-only route. Remove alongside components/demo/visual-editor and its navigation link. */
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const DemoVisualEditorPage = lazy(() => import("~/components/demo/visual-editor/demo-page"));
export const Route = createFileRoute("/demo/visual-editor")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session.environment !== "development") throw notFound();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: DemoRoute,
});
function DemoRoute() {
  const session = Route.useRouteContext();
  return (
    <WorkspaceShell user={session.user} environment={session.environment}>
      <Suspense fallback={<p className="p-8">Loading editor demo…</p>}>
        <DemoVisualEditorPage userId={session.user.id} />
      </Suspense>
    </WorkspaceShell>
  );
}
