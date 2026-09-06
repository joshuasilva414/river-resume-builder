import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Failure, unwrap } from "~/components/evidence/shared";
import { JobEditor } from "~/components/jobs/job-editor";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { getSession } from "~/server/functions";
import { getJobs } from "~/server/job-functions";
export const Route = createFileRoute("/jobs")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: JobsPage,
});
function JobsPage() {
  const session = Route.useRouteContext();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = useDeferredValue(search);
  const input = { query, archived, offset };
  const jobs = useQuery({
    queryKey: ["jobs", "list", input],
    queryFn: async () => unwrap(await getJobs({ data: input })),
    placeholderData: (previous) => previous,
  });
  return (
    <WorkspaceShell {...session}>
      <header className="space-y-4 px-5 pt-9 pb-7 md:px-10">
        <p className="eyebrow">Workspace / Job targets</p>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="font-editorial text-[40px] font-semibold leading-[44px] tracking-tight">
              Tailor your résumé to your next role.
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Add a job posting or open a saved target to continue your résumé.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus />
            Add job target
          </Button>
        </div>
      </header>
      <div className="px-5 pb-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-5 py-5">
          <Tabs
            value={archived ? "archived" : "active"}
            onValueChange={(value) => {
              setArchived(value === "archived");
              setOffset(0);
            }}
          >
            <TabsList variant="line">
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            className="w-full sm:w-64"
            aria-label="Search job targets"
            placeholder="Search job targets"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Failure error={jobs.error} />
        {jobs.error && (
          <Button className="my-3" variant="outline" onClick={() => void jobs.refetch()}>
            Retry loading jobs
          </Button>
        )}
        {jobs.isPending && <p role="status">Loading job targets…</p>}
        {jobs.data && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 border-y border-t-foreground py-3 sm:grid-cols-[minmax(0,1fr)_130px_140px_24px]">
              <span className="eyebrow">Role / Company</span>
              <span className="eyebrow hidden sm:block">Status</span>
              <span className="eyebrow hidden sm:block">Last edited</span>
              <span />
            </div>
            {jobs.data.items.map((job) => (
              <Link
                key={job.id}
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="grid min-h-[86px] grid-cols-[minmax(0,1fr)_24px] items-center gap-5 border-b py-5 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_130px_140px_24px]"
              >
                <div>
                  <p className="font-medium break-words">{job.details.role}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground break-words">
                    {job.details.company}
                    {job.details.location && ` · ${job.details.location}`}
                  </p>
                </div>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {job.archivedAt ? "Archived" : "Active"}
                </Badge>
                <time
                  className="hidden text-[13px] text-muted-foreground sm:block"
                  dateTime={new Date(job.updatedAt).toISOString()}
                >
                  {new Date(job.updatedAt).toLocaleDateString()}
                </time>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
            {!jobs.data.items.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {query
                      ? "No matching job targets"
                      : archived
                        ? "No archived job targets"
                        : "Start with a job posting"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {query
                      ? "Try a different role, company, or location."
                      : archived
                        ? "Archived targets keep their posting history and selected evidence."
                        : "Add the job description, review its requirements, and choose relevant experience for your résumé."}
                  </EmptyDescription>
                </EmptyHeader>
                {!query && !archived && (
                  <Button onClick={() => setAdding(true)}>Add job target</Button>
                )}
              </Empty>
            )}
            {(offset > 0 || jobs.data.hasMore) && (
              <div className="mt-5 flex justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={!jobs.data.hasMore}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {adding && (
        <JobEditor
          mode="create"
          onClose={() => setAdding(false)}
          onSaved={(id) => void navigate({ to: "/jobs/$jobId", params: { jobId: id } })}
        />
      )}
    </WorkspaceShell>
  );
}
