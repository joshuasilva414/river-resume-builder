import {
  blankValue,
  type ContentItem,
  type ContentNode,
  cloneContent,
  contentItemSchema,
  newIdentity,
  valueKindSchema,
} from "@river/domain/workspace";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useRecordCommands, useRecords } from "./queries";
import { inputClass, ValueInput, ValueText } from "./value-input";

const newField = (): ContentNode => ({
  kind: "field",
  id: newIdentity(),
  key: "detail",
  label: "New field",
  value: blankValue("text"),
  factIds: [],
});
const newGroup = (): ContentNode => ({
  kind: "group",
  id: newIdentity(),
  key: "entry",
  label: "New group",
  definitionId: null,
  children: [],
});
/** Reusable content owns its values. Parent collections have no implicit relationship to saved copies. */
export function ContentTreeEditor({
  node,
  onChange,
  depth = 0,
}: {
  node: ContentNode;
  onChange: (node: ContentNode) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-3 rounded border p-4">
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Label
          <input
            className={`${inputClass} mt-1 w-full`}
            value={node.label}
            onChange={(event) => onChange({ ...node, label: event.target.value })}
          />
        </label>
        <label className="w-36 text-xs text-muted-foreground">
          Field key
          <input
            className={`${inputClass} mt-1 w-full`}
            value={node.key}
            onChange={(event) => onChange({ ...node, key: event.target.value })}
          />
        </label>
        {node.kind === "field" && (
          <label className="text-xs text-muted-foreground">
            Type
            <select
              className={`${inputClass} mt-1 block`}
              value={node.value.kind}
              onChange={(event) =>
                onChange({ ...node, value: blankValue(valueKindSchema.parse(event.target.value)) })
              }
            >
              {valueKindSchema.options.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {node.kind === "field" ? (
        <ValueInput value={node.value} onChange={(value) => onChange({ ...node, value })} />
      ) : (
        <>
          {node.children.map((child, index) => (
            <div key={child.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ContentTreeEditor
                  node={child}
                  depth={depth + 1}
                  onChange={(next) =>
                    onChange({
                      ...node,
                      children: node.children.map((item) => (item.id === child.id ? next : item)),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 pt-1">
                {([-1, 1] as const).map((direction) => (
                  <Button
                    key={direction}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${child.label} ${direction < 0 ? "up" : "down"}`}
                    disabled={index + direction < 0 || index + direction >= node.children.length}
                    onClick={() => {
                      const children = [...node.children];
                      children.splice(index, 1);
                      children.splice(index + direction, 0, child);
                      onChange({ ...node, children });
                    }}
                  >
                    {direction < 0 ? <ArrowUp /> : <ArrowDown />}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${child.label}`}
                  onClick={() =>
                    onChange({
                      ...node,
                      children: node.children.filter((item) => item.id !== child.id),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...node, children: [...node.children, newField()] })}
            >
              <Plus />
              Field
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={depth >= 6}
              onClick={() => onChange({ ...node, children: [...node.children, newGroup()] })}
            >
              <Plus />
              Nested group
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
function ContentSummary({ node }: { node: ContentNode }) {
  return node.kind === "field" ? (
    <span>
      <ValueText value={node.value} />
    </span>
  ) : (
    <span>
      {node.children.slice(0, 3).map((child) => (
        <span key={child.id} className="mr-2">
          <ContentSummary node={child} />
        </span>
      ))}
      {node.children.length > 3 ? "…" : ""}
    </span>
  );
}
export default function ContentLibrary() {
  const records = useRecords("content"),
    commands = useRecordCommands();
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<{ id: string; revision: number; data: ContentItem } | null>(
      null,
    ),
    [error, setError] = useState<string | null>(null);
  const rows =
    records.data
      ?.filter((row) => row.kind === "content")
      .filter((row) => JSON.stringify(row.data).toLowerCase().includes(search.toLowerCase())) ?? [];
  return (
    <div className="space-y-7 p-5 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-normal text-4xl">Content library</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reusable bullets, skills, entries, and sections. Each copy can evolve independently.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setEditing({
                id: newIdentity(),
                revision: 0,
                data: { version: 1, name: "Untitled field", content: newField() },
              })
            }
          >
            New field
          </Button>
          <Button
            onClick={() =>
              setEditing({
                id: newIdentity(),
                revision: 0,
                data: { version: 1, name: "Untitled collection", content: newGroup() },
              })
            }
          >
            New collection
          </Button>
        </div>
      </header>
      {(error || records.error) && (
        <p role="alert" className="text-destructive">
          {error ?? records.error?.message}
        </p>
      )}
      <input
        className={`${inputClass} w-full max-w-xl`}
        aria-label="Search content"
        placeholder="Search content…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(260px,1fr)_minmax(500px,1.5fr)]">
        <section className="divide-y">
          {!rows.length && (
            <div className="rounded border border-dashed p-8 text-sm text-muted-foreground">
              Save a selection from your Fact Bank or create content here.
            </div>
          )}
          {rows.map((row) => (
            <button
              type="button"
              key={row.id}
              className={`block w-full space-y-2 p-4 text-left hover:bg-muted/40 ${editing?.id === row.id ? "bg-primary/5 ring-1 ring-primary" : ""}`}
              onClick={() => {
                setEditing({ id: row.id, revision: row.revision, data: structuredClone(row.data) });
                setError(null);
              }}
            >
              <h2 className="font-medium">{row.data.name}</h2>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                <ContentSummary node={row.data.content} />
              </p>
              <p className="text-xs text-muted-foreground">
                {row.data.content.kind === "field"
                  ? row.data.content.value.kind
                  : `${row.data.content.children.length} fields and groups`}
              </p>
            </button>
          ))}
        </section>
        {editing ? (
          <form
            className="space-y-4 border-l pl-6"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await commands.save.mutateAsync({
                  id: editing.id,
                  revision: editing.revision,
                  idempotencyKey: newIdentity(),
                  payload: { kind: "content", data: contentItemSchema.parse(editing.data) },
                });
                setEditing(null);
                setError(null);
              } catch (error) {
                setError(error instanceof Error ? error.message : "Unable to save content.");
              }
            }}
          >
            <label className="block text-sm">
              Name
              <input
                className={`${inputClass} mt-2 w-full`}
                value={editing.data.name}
                onChange={(event) =>
                  setEditing({ ...editing, data: { ...editing.data, name: event.target.value } })
                }
              />
            </label>
            <ContentTreeEditor
              node={editing.data.content}
              onChange={(content) => setEditing({ ...editing, data: { ...editing.data, content } })}
            />
            <p className="text-xs text-muted-foreground">
              Field keys match content with template fields. Font and layout are supplied by the
              template.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={commands.save.isPending}>
                Save content
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              {editing.revision > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        id: newIdentity(),
                        revision: 0,
                        data: {
                          ...editing.data,
                          name: `${editing.data.name} copy`,
                          content: cloneContent(editing.data.content),
                        },
                      })
                    }
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await commands.remove.mutateAsync({
                          id: editing.id,
                          revision: editing.revision,
                          kind: "content",
                        });
                        setEditing(null);
                      } catch (error) {
                        setError(
                          error instanceof Error ? error.message : "Unable to remove content.",
                        );
                      }
                    }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </form>
        ) : (
          <p className="p-8 text-sm text-muted-foreground">
            Select a content item to edit its fields and collections.
          </p>
        )}
      </div>
    </div>
  );
}
