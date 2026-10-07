import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getSession } from "~/server/functions";

const RenderingProof = lazy(() => import("~/components/visual-editor/pdf/rendering-proof"));
/** Development fixture only; all production rendering uses the same worker and resolver. */
export const Route = createFileRoute("/demo/pdf-proof")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session.environment !== "development") throw notFound();
    if (!session.user) throw redirect({ to: "/sign-in" });
  },
  component: () => (
    <Suspense fallback={<p>Loading renderer…</p>}>
      <RenderingProof />
    </Suspense>
  ),
});
