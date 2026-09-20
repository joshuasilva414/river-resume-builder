import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

const EditorPage = lazy(() => import("~/components/visual-editor/editor-page"));
export const Route = createFileRoute("/resumes/$resumeId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: () => {
    const session = Route.useRouteContext();
    const { resumeId } = Route.useParams();
    return (
      <WorkspaceShell {...session}>
        <Suspense fallback={<p className="p-10">Loading document workspace…</p>}>
          <EditorPage id={resumeId} kind="resume" ownerId={session.user.id} />
        </Suspense>
      </WorkspaceShell>
    );
  },
});
