import { createFileRoute, redirect } from "@tanstack/react-router";
import { Feedback } from "~/components/feedback";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";

export const Route = createFileRoute("/feedback")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  head: () => ({ meta: [{ title: "Feedback · River" }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user, environment } = Route.useRouteContext();
  return (
    <WorkspaceShell user={user} environment={environment}>
      <Feedback user={user} />
    </WorkspaceShell>
  );
}
