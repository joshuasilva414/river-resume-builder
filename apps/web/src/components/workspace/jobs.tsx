import {
  blankResume,
  type JobTargetInput,
  matchingTerms,
  newIdentity,
  valueSpans,
} from "@river/domain/workspace";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { getWorkspaceJob } from "~/server/workspace-analysis-functions";
import { listJobTargets, saveWorkspaceJob } from "~/server/workspace-jobs";
import { useRecordCommands, useRecords } from "./queries";
import { inputClass, ValueText } from "./value-input";

export default function JobTargets({ id }: { id?: string }) {
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false);
  const list = useQuery({
    queryKey: ["workspace-jobs", query, archived],
    queryFn: async () => {
      const result = await listJobTargets({ data: { query, archived } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const detail = useQuery({
    queryKey: ["workspace-job", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw Error("Select a job target.");
      const result = await getWorkspaceJob({ data: id });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const [adding, setAdding] = useState(false);
  const initial = detail.data;
  if (id)
    return (
      <div className="p-5 lg:p-10">
        <a href="/jobs" className="text-sm text-primary">
          ← Job targets
        </a>
        {detail.error && <p role="alert">{detail.error.message}</p>}
        {initial && (
          <JobForm
            key={`${initial.id}:${initial.revision}`}
            initial={{
              id: initial.id,
              revision: initial.revision,
              idempotencyKey: newIdentity(),
              details: { ...initial.details },
              description: initial.description,
              url: initial.url,
              factIds: initial.factIds,
              archived: !!initial.archivedAt,
            }}
            onSaved={() => detail.refetch()}
            history={initial.snapshots}
          />
        )}
      </div>
    );
  return (
    <div className="space-y-7 p-5 lg:p-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-4xl">Job targets</h1>
          <p className="mt-2 text-muted-foreground">
            Keep the posting and choose facts for your application.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>Add job target</Button>
      </header>
      {adding && (
        <JobForm
          initial={{
            id: newIdentity(),
            revision: 0,
            idempotencyKey: newIdentity(),
            details: { role: "", company: "", location: "" },
            description: "",
            url: null,
            factIds: [],
            archived: false,
          }}
          onSaved={(id) => window.location.assign(`/jobs/${id}`)}
        />
      )}
      <div className="flex gap-3">
        <input
          className={inputClass}
          aria-label="Search job targets"
          placeholder="Search roles or companies"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="outline" aria-pressed={archived} onClick={() => setArchived(!archived)}>
          {archived ? "Show active" : "Show archived"}
        </Button>
      </div>
      {list.error && <p role="alert">{list.error.message}</p>}
      {!list.isPending && !list.data?.length && (
        <p className="rounded border border-dashed p-10 text-center">
          No job targets here. Add a posting to begin.
        </p>
      )}
      {list.data?.map((job) => (
        <a key={job.id} href={`/jobs/${job.id}`} className="block border-b py-5">
          <h2 className="font-serif text-2xl">{job.details.role}</h2>
          <p className="text-sm text-muted-foreground">
            {job.details.company} · {job.details.location}
          </p>
        </a>
      ))}
    </div>
  );
}
function JobForm({
  initial,
  onSaved,
  history = [],
}: {
  initial: JobTargetInput;
  onSaved: (id: string) => void;
  history?: { id: string; text: string; createdAt: number }[];
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [factSearch, setFactSearch] = useState(""),
    [templateId, setTemplateId] = useState("");
  const facts = useRecords("fact"),
    templates = useRecords("template"),
    commands = useRecordCommands();
  const change = (next: Partial<JobTargetInput>) =>
    setDraft({ ...draft, ...next, idempotencyKey: newIdentity() });
  const available =
    facts.data
      ?.filter((record) => record.kind === "fact")
      .map((record) => ({
        record,
        terms: matchingTerms(
          draft.description,
          `${record.data.label} ${valueSpans(record.data.value)
            .map((span) => span.text)
            .join("")}`,
        ),
      }))
      .filter(({ record }) =>
        `${record.data.label} ${valueSpans(record.data.value)
          .map((span) => span.text)
          .join("")}`
          .toLowerCase()
          .includes(factSearch.toLowerCase()),
      )
      .sort((a, b) => b.terms.length - a.terms.length) ?? [];
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveWorkspaceJob({ data: draft });
      if (!result.ok) throw Error(result.error.title);
      onSaved(result.value.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-serif text-3xl">
            {initial.revision ? initial.details.role : "New job target"}
          </h2>
          {(["role", "company", "location"] as const).map((key) => (
            <label key={key} className="block text-sm capitalize">
              {key}
              <input
                className={`${inputClass} mt-1`}
                value={draft.details[key]}
                onChange={(e) => change({ details: { ...draft.details, [key]: e.target.value } })}
              />
            </label>
          ))}
          <label className="block text-sm">
            Posting URL (optional)
            <input
              className={`${inputClass} mt-1`}
              value={draft.url ?? ""}
              onChange={(e) => change({ url: e.target.value || null })}
            />
          </label>
          <label className="block text-sm">
            Job description
            <textarea
              className={`${inputClass} mt-1 min-h-64`}
              value={draft.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.archived}
              onChange={(e) => change({ archived: e.target.checked })}
            />
            Archived
          </label>
        </section>
        <section className="space-y-4">
          <h2 className="font-serif text-2xl">Facts for this job</h2>
          <p className="text-sm text-muted-foreground">
            Keyword overlap helps you find relevant information. It does not assess qualifications.
            Earlier evidence selections must be rebuilt here.
          </p>
          <input
            className={inputClass}
            aria-label="Search candidate facts"
            placeholder="Search candidate facts"
            value={factSearch}
            onChange={(e) => setFactSearch(e.target.value)}
          />
          {available.length === 0 && (
            <p>
              No matching facts.{" "}
              <a href="/facts" className="text-primary">
                Open Fact Bank
              </a>
            </p>
          )}
          {available.map(({ record, terms }) => (
            <label key={record.id} className="flex gap-3 border-b py-3">
              <input
                type="checkbox"
                checked={draft.factIds.includes(record.id)}
                onChange={(e) =>
                  change({
                    factIds: e.target.checked
                      ? [...draft.factIds, record.id]
                      : draft.factIds.filter((id) => id !== record.id),
                  })
                }
              />
              <span>
                <span className="block font-medium">{record.data.label}</span>
                <ValueText value={record.data.value} />
                {terms.length > 0 && (
                  <span className="mt-1 block text-xs text-primary">
                    Shared terms: {terms.join(", ")}
                  </span>
                )}
              </span>
            </label>
          ))}
          {draft.factIds.some((id) => !facts.data?.some((fact) => fact.id === id)) && (
            <Button
              variant="outline"
              onClick={() =>
                change({
                  factIds: draft.factIds.filter((id) => facts.data?.some((fact) => fact.id === id)),
                })
              }
            >
              Remove unavailable selections
            </Button>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save job and selection"}
      </Button>
      {initial.revision > 0 && (
        <section className="space-y-3 border-t pt-6">
          <h2 className="font-serif text-2xl">Create a tailored résumé</h2>
          <p className="text-sm text-muted-foreground">
            Captures the saved job description. Add your selected facts through the editor.
          </p>
          <select
            className={inputClass}
            aria-label="Résumé template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Choose a visual template…</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.kind === "template" ? t.data.name : ""}
              </option>
            ))}
          </select>
          <Button
            disabled={!templateId || commands.save.isPending}
            onClick={async () => {
              const template = templates.data?.find((t) => t.id === templateId);
              if (template?.kind !== "template") return;
              try {
                const resume = blankResume(template.data, template.id, template.revision);
                resume.job = {
                  id: initial.id,
                  title: initial.details.role,
                  description: initial.description,
                };
                resume.name = `${initial.details.company} · ${initial.details.role}`;
                const id = newIdentity();
                await commands.save.mutateAsync({
                  id,
                  revision: 0,
                  idempotencyKey: newIdentity(),
                  payload: { kind: "resume", data: resume },
                });
                window.location.assign(`/resumes/${id}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to create résumé.");
              }
            }}
          >
            Create résumé
          </Button>
        </section>
      )}
      {!!history.length && (
        <details className="border-t pt-5">
          <summary>Saved job descriptions ({history.length})</summary>
          {history.map((snapshot) => (
            <details key={snapshot.id} className="py-3">
              <summary>{new Date(snapshot.createdAt).toLocaleString()}</summary>
              <p className="whitespace-pre-wrap text-sm">{snapshot.text}</p>
            </details>
          ))}
        </details>
      )}
    </div>
  );
}
