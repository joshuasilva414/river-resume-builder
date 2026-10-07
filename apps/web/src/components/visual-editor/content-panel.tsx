import {
  bindGroup,
  type ContentNode,
  cloneContent,
  contentFromFacts,
  type EntryDefinition,
  findContent,
  mapContent,
  mapIntoDefinition,
  newIdentity,
  populated,
  valueSpans,
} from "@river/domain/workspace";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useRecordCommands, useRecords } from "~/components/workspace/queries";
import { inputClass, ValueText } from "~/components/workspace/value-input";
import { importWorkspaceFacts } from "~/server/workspace";
import { FieldMapping } from "./field-mapping";
import { contentPath } from "./projection";
import type { EditorController } from "./use-editor-controller";

function insertionNodes(source: ContentNode, definition: EntryDefinition): ContentNode[] {
  if (source.kind === "field") return [source];
  const groupField = definition.fields.find(
    (field) =>
      field.type === "group" &&
      (field.key === source.key || field.definitionId === source.definitionId),
  );
  if (groupField) return [{ ...source, key: groupField.key }];
  if (mapIntoDefinition(source.children, definition).accepted.length) return source.children;
  return definition.fields.some((field) => field.type === "group") ? [source] : source.children;
}
export function ContentPanel({ controller: c }: { controller: EditorController }) {
  const library = useRecords("content"),
    facts = useRecords("fact"),
    commands = useRecordCommands();
  const [tab, setTab] = useState<"content" | "facts">("content"),
    [error, setError] = useState<string | null>(null),
    [mapping, setMapping] = useState<{
      source: ContentNode;
      targetId: string;
      before: string;
      fields: Record<string, string>;
      fromUnused: string | null;
    } | null>(null),
    [selectedFacts, setSelectedFacts] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const parent =
    c.content?.kind === "group"
      ? c.content
      : c.content
        ? contentPath(c.resume.sections, c.content.id).at(-2)
        : undefined;
  const target = parent?.kind === "group" ? parent : undefined;
  const mappedTarget = mapping ? findContent(c.resume.sections, mapping.targetId) : target;
  const definition = c.resume.template.document.definitions.find(
    (item) => item.id === (mappedTarget?.kind === "group" ? mappedTarget.definitionId : null),
  );
  const prepare = (node: ContentNode, fromUnused = false) => {
    if (!target) return;
    setMapping({
      source: fromUnused ? structuredClone(node) : cloneContent(node),
      fromUnused: fromUnused ? node.id : null,
      targetId: target.id,
      before: JSON.stringify(target),
      fields: {},
    });
    setError(null);
  };
  const saveFacts = async () => {
    if (!c.content) return;
    const leaves = (node: ContentNode): ContentNode[] =>
      node.kind === "field" ? [node] : node.children.flatMap(leaves);
    const id = newIdentity(),
      values = leaves(c.content).flatMap((node) =>
        node.kind === "field" && populated(node.value)
          ? [
              {
                id: newIdentity(),
                key: node.key,
                label: node.label || node.key,
                value: node.value,
                contextId: c.content?.kind === "group" ? id : null,
                sourceId: null,
              },
            ]
          : [],
      );
    if (!values.length) {
      setError("This block has no populated values to save.");
      return;
    }
    const result = await importWorkspaceFacts({
      data: {
        idempotencyKey: newIdentity(),
        contexts:
          c.content.kind === "group" ? [{ id, label: c.content.label, kind: "custom" }] : [],
        facts: values,
      },
    });
    if (!result.ok) setError(result.error.title);
    else {
      await facts.refetch();
      setError(null);
    }
  };
  return (
    <aside className="visual-inspector space-y-5" aria-label="Résumé content controls">
      <h2 className="font-serif text-2xl font-normal">{c.content?.label ?? "Your content"}</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        Select a section or entry to insert content. Double-click a field to edit. Layout is
        supplied by the captured template.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {c.content && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => c.moveBy(-1)}>
              <ArrowUp />
              Up
            </Button>
            <Button size="sm" variant="outline" onClick={() => c.moveBy(1)}>
              <ArrowDown />
              Down
            </Button>
            <Button size="sm" variant="outline" onClick={c.remove}>
              <Trash2 />
              Remove
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!c.content) return;
                try {
                  await commands.save.mutateAsync({
                    id: newIdentity(),
                    revision: 0,
                    idempotencyKey: newIdentity(),
                    payload: {
                      kind: "content",
                      data: {
                        version: 1,
                        name: c.content.label || "Saved content",
                        content: cloneContent(c.content),
                      },
                    },
                  });
                  setError(null);
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Unable to save content.");
                }
              }}
            >
              Save block to library
            </Button>
            <Button size="sm" variant="outline" onClick={() => void saveFacts()}>
              Save information to Fact Bank
            </Button>
          </div>
        </>
      )}
      {target && definition && (
        <div className="space-y-2">
          {definition.fields
            .filter((field) => field.repeat)
            .map((field) => (
              <Button
                key={field.id}
                className="w-full"
                size="sm"
                variant="outline"
                onClick={() => c.commands.add(target.id, field.key)}
              >
                <Plus />
                Add blank {field.label.toLowerCase()}
              </Button>
            ))}
        </div>
      )}
      {mapping && definition ? (
        <section className="space-y-4 border-t pt-4">
          <p className="text-xs uppercase text-primary">Insert reusable content</p>
          <h3 className="font-serif text-2xl font-normal">Match the fields.</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Compatible keys and types match automatically. Unused values stay with this résumé.
          </p>
          <FieldMapping
            nodes={insertionNodes(mapping.source, definition)}
            definition={definition}
            template={c.resume.template.document}
            mapping={mapping.fields}
            onChange={(fields) => setMapping({ ...mapping, fields })}
          />
          <Button
            className="w-full"
            onClick={() => {
              const current = findContent(c.resume.sections, mapping.targetId);
              if (current?.kind !== "group" || JSON.stringify(current) !== mapping.before) {
                setError("The destination changed. Close this preview and select it again.");
                return;
              }
              const nodes = insertionNodes(mapping.source, definition);
              const mapped = mapIntoDefinition(nodes, definition, mapping.fields),
                unused = [...mapped.unused];
              const accepted = mapped.accepted.map((node) => {
                if (node.kind !== "group") return node;
                const field = definition.fields.find((field) => field.key === node.key);
                if (!field?.definitionId) return node;
                const bound = bindGroup(
                  node,
                  c.resume.template.document,
                  field.definitionId,
                  mapping.fields,
                );
                unused.push(...bound.unused);
                return bound.group;
              });
              c.updateResume((resume) => ({
                ...resume,
                sections: mapContent(resume.sections, current.id, (node) =>
                  node.kind === "group"
                    ? {
                        ...node,
                        children: [
                          ...node.children.filter(
                            (child) =>
                              !accepted.some(
                                (item) =>
                                  item.key === child.key &&
                                  !definition.fields.find((field) => field.key === child.key)
                                    ?.repeat,
                              ),
                          ),
                          ...accepted,
                        ],
                      }
                    : node,
                ),
                unused: [
                  ...resume.unused.filter((node) => node.id !== mapping.fromUnused),
                  ...unused,
                ],
              }));
              setMapping(null);
              setSelectedFacts([]);
            }}
          >
            Insert mapped content
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMapping(null)}>
            Cancel
          </Button>
        </section>
      ) : (
        <section className="space-y-3 border-t pt-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === "content" ? "secondary" : "ghost"}
              onClick={() => setTab("content")}
            >
              Library
            </Button>
            <Button
              size="sm"
              variant={tab === "facts" ? "secondary" : "ghost"}
              onClick={() => setTab("facts")}
            >
              Facts
            </Button>
          </div>
          <input
            aria-label="Search insertable content"
            className={inputClass}
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {tab === "content" ? (
            (library.data
              ?.filter((row) => row.kind === "content")
              .filter((row) =>
                JSON.stringify(row.data).toLowerCase().includes(search.toLowerCase()),
              )
              .map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="block w-full rounded border p-3 text-left text-sm disabled:opacity-50"
                  disabled={!target}
                  onClick={() => prepare(row.data.content)}
                >
                  {row.data.name}
                </button>
              )) ?? <p className="text-xs">Loading content…</p>)
          ) : (
            <>
              {facts.data
                ?.filter((row) => row.kind === "fact")
                .filter((row) =>
                  `${row.data.label} ${valueSpans(row.data.value)
                    .map((span) => span.text)
                    .join("")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((row) => (
                  <label key={row.id} className="flex gap-2 rounded border p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedFacts.includes(row.id)}
                      onChange={() =>
                        setSelectedFacts(
                          selectedFacts.includes(row.id)
                            ? selectedFacts.filter((id) => id !== row.id)
                            : [...selectedFacts, row.id],
                        )
                      }
                    />
                    <span>
                      {row.data.label}
                      <span className="mt-1 block text-muted-foreground">
                        <ValueText value={row.data.value} />
                      </span>
                    </span>
                  </label>
                ))}
              <Button
                disabled={!target || !selectedFacts.length}
                onClick={() =>
                  prepare(
                    contentFromFacts(
                      facts.data
                        ?.filter((row) => row.kind === "fact")
                        .filter((row) => selectedFacts.includes(row.id))
                        .map((row) => row.data) ?? [],
                      "Selected facts",
                    ),
                  )
                }
              >
                Insert selected facts
              </Button>
            </>
          )}
          {((tab === "content" && !library.data?.length) ||
            (tab === "facts" && !facts.data?.length)) && (
            <p className="text-xs leading-5 text-muted-foreground">
              Nothing saved here yet. You can author directly in the résumé.
            </p>
          )}
        </section>
      )}
      {!!c.resume.unused.length && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">Unused content · {c.resume.unused.length}</h3>
          <p className="text-xs text-muted-foreground">
            These values are retained and do not print.
          </p>
          {c.resume.unused.map((node) => (
            <button
              key={node.id}
              type="button"
              disabled={!target}
              className="block w-full rounded border p-2 text-left text-xs"
              onClick={() => prepare(node, true)}
            >
              {node.label || node.key}
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
