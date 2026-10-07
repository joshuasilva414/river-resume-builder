import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { inputClass } from "~/components/workspace/value-input";
import { getWorkspaceJob, getWorkspaceJobs } from "~/server/workspace-analysis-functions";
import type { EditorController } from "./use-editor-controller";
export function JobPicker({ controller: c }: { controller: EditorController }) {
  const [search, setSearch] = useState(""),
    [error, setError] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ["workspace", "job-choices", search],
    queryFn: async () => {
      const result = await getWorkspaceJobs({ data: search });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  return (
    <section className="space-y-2 border-t pt-4">
      <label className="block text-xs">
        Job target
        <input
          aria-label="Find job target"
          className={`${inputClass} mt-2`}
          placeholder="Search saved jobs…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <select
        aria-label="Captured job target"
        className={inputClass}
        value={c.resume.job?.id ?? ""}
        onChange={async (event) => {
          const id = event.target.value;
          if (!id) {
            c.updateResume((resume) => ({ ...resume, job: null }));
            return;
          }
          const result = await getWorkspaceJob({ data: id });
          if (!result.ok) {
            setError(result.error.title);
            return;
          }
          const job = result.value;
          c.updateResume((resume) => ({
            ...resume,
            job: {
              id: job.id,
              title: `${job.details.role} · ${job.details.company}`,
              description: job.description,
            },
          }));
          setError(null);
        }}
      >
        <option value="">No job selected</option>
        {c.resume.job && !jobs.data?.some((job) => job.id === c.resume.job?.id) && (
          <option value={c.resume.job.id}>{c.resume.job.title}</option>
        )}
        {jobs.data?.map((job) => (
          <option key={job.id} value={job.id}>
            {job.details.role} · {job.details.company}
          </option>
        ))}
      </select>
      {(error || jobs.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error ?? jobs.error?.message}
        </p>
      )}
      {c.resume.job && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Captured description
          </summary>
          <p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs leading-5">
            {c.resume.job.description}
          </p>
        </details>
      )}
    </section>
  );
}
