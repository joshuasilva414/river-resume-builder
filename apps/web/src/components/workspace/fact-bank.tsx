import {
  blankValue,
  type CandidateFact,
  candidateFactSchema,
  contentFromFacts,
  type FactContext,
  newIdentity,
  valueKindSchema,
  valueSpans,
} from "@river/domain/workspace";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useRecordCommands, useRecords } from "./queries";
import { inputClass, ValueInput, ValueText } from "./value-input";

export default function FactBank() {
  const facts = useRecords("fact"),
    contexts = useRecords("context"),
    commands = useRecordCommands();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<{ fact: CandidateFact; revision: number } | null>(null),
    [context, setContext] = useState<{ data: FactContext; revision: number } | null>(null),
    [failure, setFailure] = useState<string | null>(null);
  const factRows = facts.data?.filter((row) => row.kind === "fact") ?? [],
    contextRows = contexts.data?.filter((row) => row.kind === "context") ?? [];
  const visible = factRows.filter(
    (row) =>
      (!kind || row.data.value.kind === kind) &&
      `${row.data.label} ${valueSpans(row.data.value)
        .map((span) => span.text)
        .join(
          "",
        )} ${contextRows.find((context) => context.id === row.data.contextId)?.data.label ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const newFact = () => {
    const id = newIdentity();
    setEditing({
      revision: 0,
      fact: {
        id,
        key: "detail",
        label: "",
        value: blankValue("text"),
        contextId: null,
        sourceId: null,
      },
    });
  };
  const saveFact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      const data = candidateFactSchema.parse(editing.fact);
      await commands.save.mutateAsync({
        id: data.id,
        revision: editing.revision,
        idempotencyKey: newIdentity(),
        payload: { kind: "fact", data },
      });
      setEditing(null);
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Unable to save fact.");
    }
  };
  return (
    <div className="flex flex-col gap-7 p-5 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-normal text-4xl">Fact Bank</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The details of your experience, ready to use.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <a href="/facts/import">Import facts</a>
          </Button>
          <Button onClick={newFact}>
            <Plus />
            New fact
          </Button>
        </div>
      </header>
      {(failure || facts.error || contexts.error) && (
        <p role="alert" className="text-destructive">
          {failure ?? facts.error?.message ?? contexts.error?.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${inputClass} min-w-48 flex-1 !w-auto`}
          aria-label="Search facts"
          placeholder="Search facts, employers, projects…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter fact type"
          className={`${inputClass} !w-40`}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">All types</option>
          {valueKindSchema.options.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={() =>
            setContext({ revision: 0, data: { id: newIdentity(), label: "", kind: "custom" } })
          }
        >
          + New context
        </Button>
      </div>
      {context && (
        <form
          className="flex flex-wrap items-end gap-3 border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await commands.save.mutateAsync({
                id: context.data.id,
                revision: context.revision,
                idempotencyKey: newIdentity(),
                payload: { kind: "context", data: context.data },
              });
              setContext(null);
            } catch (error) {
              setFailure(error instanceof Error ? error.message : "Unable to save context.");
            }
          }}
        >
          <label className="flex-1">
            Context name
            <input
              required
              className={inputClass}
              value={context.data.label}
              onChange={(event) =>
                setContext({ ...context, data: { ...context.data, label: event.target.value } })
              }
            />
          </label>
          <label>
            Type
            <select
              className={inputClass}
              value={context.data.kind}
              onChange={(event) => {
                const type = event.target.value;
                if (
                  type === "custom" ||
                  type === "employment" ||
                  type === "project" ||
                  type === "profile" ||
                  type === "education"
                )
                  setContext({ ...context, data: { ...context.data, kind: type } });
              }}
            >
              {["employment", "project", "education", "profile", "custom"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={commands.save.isPending}>
            Save context
          </Button>
          <Button type="button" variant="ghost" onClick={() => setContext(null)}>
            Cancel
          </Button>
          {context.revision > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                try {
                  await commands.remove.mutateAsync({
                    id: context.data.id,
                    revision: context.revision,
                    kind: "context",
                  });
                  setContext(null);
                  setFailure(null);
                } catch (error) {
                  setFailure(error instanceof Error ? error.message : "Unable to delete context.");
                }
              }}
            >
              Delete context
            </Button>
          )}
        </form>
      )}
      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1">
          {facts.isPending && <p role="status">Loading facts…</p>}
          {!facts.isPending && factRows.length === 0 && (
            <div className="py-16">
              <h2 className="font-serif font-normal text-3xl">Start with what you know.</h2>
              <p className="mt-3 max-w-lg text-muted-foreground">
                Add a role, a project, a skill, or an accomplishment. Import a document to collect
                several facts at once.
              </p>
              <Button className="mt-6" onClick={newFact}>
                Add your first fact
              </Button>
            </div>
          )}
          {[
            ...contextRows.map((row) => ({ id: row.id, label: row.data.label, row })),
            { id: null, label: "Ungrouped", row: null },
          ].map((group) => {
            const rows = visible.filter((row) => row.data.contextId === group.id);
            if (!rows.length && !group.row) return null;
            if (!rows.length && query) return null;
            return (
              <section key={group.id ?? "ungrouped"} className="mb-8">
                <div className="flex items-center justify-between border-b py-4">
                  <h2 className="font-serif font-normal text-2xl">{group.label}</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{rows.length} facts</span>
                    {group.row && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${group.label}`}
                        onClick={() =>
                          setContext({ data: group.row.data, revision: group.row.revision })
                        }
                      >
                        <MoreHorizontal />
                      </Button>
                    )}
                  </div>
                </div>
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center gap-3.5 border-b px-3 py-4.5 ${selected.includes(row.id) ? "bg-accent" : ""}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.data.label}`}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, row.id]
                            : ids.filter((id) => id !== row.id),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
                      onClick={() =>
                        setEditing({ fact: structuredClone(row.data), revision: row.revision })
                      }
                    >
                      <span className="text-xs text-muted-foreground">{row.data.label}</span>
                      <span className="text-[15px] leading-5.5">
                        <ValueText value={row.data.value} />
                      </span>
                    </button>
                    <span className="w-12 text-xs text-muted-foreground">
                      {row.data.value.kind}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${row.data.label}`}
                      onClick={() =>
                        setEditing({ fact: structuredClone(row.data), revision: row.revision })
                      }
                    >
                      <MoreHorizontal />
                    </Button>
                  </div>
                ))}
              </section>
            );
          })}
          {selected.length > 0 && (
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background py-4">
              <span className="text-sm">{selected.length} selected</span>
              <Button
                variant="outline"
                disabled={commands.save.isPending}
                onClick={async () => {
                  try {
                    const chosen = factRows
                      .filter((row) => selected.includes(row.id))
                      .map((row) => row.data);
                    const name =
                      chosen.length === 1 ? (chosen[0]?.label ?? "Saved content") : "Saved facts";
                    const group = contentFromFacts(chosen, name);
                    await commands.save.mutateAsync({
                      id: newIdentity(),
                      revision: 0,
                      idempotencyKey: newIdentity(),
                      payload: {
                        kind: "content",
                        data: {
                          version: 1,
                          name,
                          content: chosen.length === 1 ? (group.children[0] ?? group) : group,
                        },
                      },
                    });
                    setSelected([]);
                  } catch (error) {
                    setFailure(error instanceof Error ? error.message : "Unable to save content.");
                  }
                }}
              >
                Save as reusable content
              </Button>
            </div>
          )}
        </div>
        {editing && (
          <form
            className="flex w-full shrink-0 flex-col gap-5 border-l pl-6 xl:w-80"
            onSubmit={saveFact}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-muted-foreground">
                {editing.revision ? "Selected fact" : "New fact"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close fact editor"
                onClick={() => setEditing(null)}
              >
                <X />
              </Button>
            </div>
            <h2 className="font-serif font-normal text-3xl">{editing.fact.label || "New fact"}</h2>
            <label className="text-sm">
              Label
              <input
                required
                className={inputClass}
                value={editing.fact.label}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    fact: {
                      ...editing.fact,
                      label: event.target.value,
                      key: editing.revision
                        ? editing.fact.key
                        : event.target.value.toLowerCase().replace(/\W+/g, "-") || "detail",
                    },
                  })
                }
              />
            </label>
            <label className="text-sm">
              Type
              <select
                className={inputClass}
                value={editing.fact.value.kind}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    fact: {
                      ...editing.fact,
                      value: blankValue(valueKindSchema.parse(event.target.value)),
                    },
                  })
                }
              >
                {valueKindSchema.options.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Context
              <select
                className={inputClass}
                value={editing.fact.contextId ?? ""}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    fact: { ...editing.fact, contextId: event.target.value || null },
                  })
                }
              >
                <option value="">Ungrouped</option>
                {contextRows.map((context) => (
                  <option key={context.id} value={context.id}>
                    {context.data.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <p className="mb-2">Value</p>
              <ValueInput
                value={editing.fact.value}
                onChange={(value) => setEditing({ ...editing, fact: { ...editing.fact, value } })}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Changes affect this fact. Existing content and résumés keep their copies.
            </p>
            <Button type="submit" disabled={commands.save.isPending}>
              {commands.save.isPending ? "Saving…" : "Save fact"}
            </Button>
            {editing.revision > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    await commands.remove.mutateAsync({
                      id: editing.fact.id,
                      revision: editing.revision,
                      kind: "fact",
                    });
                    setSelected((ids) => ids.filter((id) => id !== editing.fact.id));
                    setEditing(null);
                  } catch (error) {
                    setFailure(error instanceof Error ? error.message : "Unable to remove fact.");
                  }
                }}
              >
                Remove fact
              </Button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
