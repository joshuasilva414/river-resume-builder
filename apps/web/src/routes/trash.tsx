import { createFileRoute, redirect } from "@tanstack/react-router";
import { TrashList } from "~/components/trash/list";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

export const Route = createFileRoute("/trash")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: TrashPage,
});
function TrashPage() {
  return (
    <WorkspaceShell {...Route.useRouteContext()}>
      <header className="space-y-3 border-b px-5 py-7 md:px-8">
        <p className="eyebrow">Workspace / Trash</p>
        <h1 className="page-heading">Deleted items can come back.</h1>
        <p className="text-sm text-muted-foreground">
          Restore sources, evidence, content, sections, templates, and jobs.
        </p>
      </header>
      <TrashList />
    </WorkspaceShell>
  );
}
