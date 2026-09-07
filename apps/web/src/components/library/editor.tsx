import {
  blockDefinitions,
  type ContentType,
  canonicalJson,
  contentTypes,
  type LibraryBinding,
  type LibraryData,
  type LibraryKind,
  type LibraryReference,
  newId,
  validateLibraryData,
} from "@river/domain";
import { useForm } from "@tanstack/react-form";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { EvidenceLinks } from "./evidence-links";
import { LibraryPicker } from "./picker";
import {
  kindLabels,
  LibraryConflict,
  LibraryDataView,
  type LibraryDetail,
  type LibraryNode,
  useLibraryCommand,
  useLibraryDetail,
} from "./shared";

function emptyData(kind: LibraryKind, type: ContentType): LibraryData {
  if (kind === "content") return { kind, type, wording: "", evidence: [] };
  if (kind === "block") return { kind, type, fields: [] };
  return { kind, type, heading: blockDefinitions[type].heading, blocks: [] };
}
export function LibraryEditor({
  kind,
  initialType = "summary",
  detail,
  seed,
  onClose,
  onSaved,
}: {
  kind: LibraryKind;
  initialType?: ContentType;
  detail?: LibraryDetail;
  seed?: LibraryData;
  onClose: () => void;
  onSaved: (reference: LibraryReference) => void;
}) {
  const [original] = useState(() => seed ?? detail?.revision.data ?? emptyData(kind, initialType));
  const [data, setData] = useState<LibraryData>(original);
  const [graph, setGraph] = useState<readonly LibraryNode[]>(detail?.graph ?? []);
  const [picker, setPicker] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [validation, setValidation] = useState<Error | null>(null);
  const mutation = useLibraryCommand((outcome) => {
    if (outcome.revisionId) onSaved({ itemId: outcome.id, revisionId: outcome.revisionId });
    onClose();
  });
  const form = useForm({
    defaultValues: { label: detail?.revision.label ?? "", rationale: "" },
    onSubmit: async ({ value }) => {
      try {
        validateLibraryData(data);
        setValidation(null);
      } catch (error) {
        setValidation(error instanceof Error ? error : new Error("Check the typed bindings."));
        return;
      }
      await mutation
        .mutateAsync({
          id: detail?.item.id ?? null,
          revision: detail?.item.revision ?? null,
          label: value.label,
          rationale: value.rationale,
          data,
        })
        .catch(() => {});
    },
  });
  const bindings = (key: string) =>
    data.kind === "section"
      ? data.blocks
      : data.kind === "block"
        ? (data.fields.find((field) => field.key === key)?.contents ?? [])
        : [];
  const changeBindings = (key: string, contents: readonly LibraryBinding[]) => {
    if (data.kind === "section") setData({ ...data, blocks: contents });
    if (data.kind === "block")
      setData({
        ...data,
        fields: blockDefinitions[data.type].fields.map((field) => ({
          key: field.key,
          contents:
            field.key === key
              ? contents
              : (data.fields.find((value) => value.key === field.key)?.contents ?? []),
        })),
      });
  };
  const hasBindings =
    data.kind === "block"
      ? data.fields.some((field) => field.contents.length > 0)
      : data.kind === "section"
        ? data.blocks.length > 0
        : false;
  const addBinding = (key: string, ref: LibraryReference) => {
    const field =
      data.kind === "block"
        ? blockDefinitions[data.type].fields.find((field) => field.key === key)
        : undefined;
    changeBindings(
      key,
      field?.max === 1 || (data.kind === "section" && data.type === "contact")
        ? [{ id: newId(), ...ref }]
        : [...bindings(key), { id: newId(), ...ref }],
    );
  };
  return (
    <form.Subscribe selector={(state) => [state.values, state.isDirty] as const}>
      {([values, dirty]) => (
        <EvidenceDialog
          title={`${detail ? "Edit" : "New"} ${kindLabels[kind].toLowerCase()}`}
          description="Save a new library revision. Résumés using an earlier revision keep their current content."
          onClose={onClose}
          dirty={dirty || canonicalJson(data) !== canonicalJson(original)}
          pending={mutation.isPending}
          className={kind === "content" ? "sm:max-w-[792px]" : "sm:max-w-[676px]"}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field name="label">
              {(field) => (
                <FormField label="Library label">
                  <Input
                    maxLength={160}
                    required
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FormField>
              )}
            </form.Field>
            <p className="text-xs text-muted-foreground">
              This label helps you find the item. It is not printed.
            </p>
            <FormField label={`${kindLabels[kind]} type`}>
              <select
                className={selectClass}
                disabled={Boolean(detail) || hasBindings}
                value={data.type}
                onChange={(event) => {
                  const type = contentTypes.find((type) => type === event.target.value);
                  if (!type) return;
                  setData(data.kind === "content" ? { ...data, type } : emptyData(data.kind, type));
                }}
              >
                {contentTypes.map((type) => (
                  <option key={type} value={type}>
                    {blockDefinitions[type].label}
                  </option>
                ))}
              </select>
            </FormField>
            {data.kind === "content" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {blockDefinitions[data.type].prompt}
                </p>
                <FormField label="Wording">
                  <Textarea
                    className="min-h-32"
                    required
                    maxLength={10000}
                    value={data.wording}
                    onChange={(event) => setData({ ...data, wording: event.target.value })}
                  />
                </FormField>
                <EvidenceLinks
                  value={data.evidence}
                  onChange={(evidence) => setData({ ...data, evidence })}
                />
              </>
            )}
            {data.kind === "section" && (
              <>
                <FormField label="Section heading">
                  <Input
                    maxLength={120}
                    disabled={data.type === "contact"}
                    required={data.type !== "contact"}
                    value={data.heading}
                    onChange={(event) => setData({ ...data, heading: event.target.value })}
                  />
                </FormField>
                {data.type === "contact" && (
                  <p className="text-sm text-muted-foreground">
                    Contact/header is printed without a Section heading.
                  </p>
                )}
                <BindingList
                  label="Entries in reading order"
                  refs={data.blocks}
                  graph={graph}
                  limit={data.type === "contact" ? 1 : 30}
                  onChange={(refs) => changeBindings("blocks", refs)}
                  onChoose={() => setPicker("blocks")}
                  onCreate={() => setCreating("blocks")}
                />
              </>
            )}
            {data.kind === "block" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose or write the details for each field. Your résumé template handles the
                  layout.
                </p>
                {blockDefinitions[data.type].fields.map((field) => (
                  <BindingList
                    key={field.key}
                    label={`${field.label}${field.min ? " · required" : " · optional"}`}
                    refs={bindings(field.key)}
                    graph={graph}
                    limit={field.max}
                    onChange={(refs) => changeBindings(field.key, refs)}
                    onChoose={() => setPicker(field.key)}
                    onCreate={() => setCreating(field.key)}
                  />
                ))}
              </>
            )}
            <form.Field name="rationale">
              {(field) => (
                <FormField label="Reason for this revision (optional)">
                  <Textarea
                    maxLength={4000}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FormField>
              )}
            </form.Field>
            <Failure error={validation} />
            <LibraryConflict
              id={detail?.item.id ?? null}
              error={mutation.error}
              local={
                <div className="space-y-3">
                  <p>{values.label}</p>
                  <LibraryDataView data={data} graph={graph} />
                </div>
              }
              onReload={onClose}
            />
            <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={mutation.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={
                  mutation.isPending ||
                  !values.label.trim() ||
                  (data.kind === "content" && !data.wording.trim())
                }
              >
                {mutation.isPending
                  ? "Saving…"
                  : detail
                    ? "Save new revision"
                    : `Create ${kindLabels[kind].toLowerCase()}`}
              </Button>
            </div>
          </form>
          {picker && (
            <LibraryPicker
              kind={data.kind === "section" ? "block" : "content"}
              type={data.type}
              onClose={() => setPicker(null)}
              onPick={(reference, child) => {
                addBinding(picker, reference);
                setGraph((previous) => [
                  ...new Map(
                    [...previous, ...child.graph].map((node) => [node.revision.id, node]),
                  ).values(),
                ]);
                setPicker(null);
              }}
            />
          )}
          {creating && (
            <LibraryEditor
              kind={data.kind === "section" ? "block" : "content"}
              initialType={data.type}
              onClose={() => setCreating(null)}
              onSaved={(reference) => addBinding(creating, reference)}
            />
          )}
        </EvidenceDialog>
      )}
    </form.Subscribe>
  );
}
function BindingList({
  label,
  refs,
  graph,
  limit,
  onChange,
  onChoose,
  onCreate,
}: {
  label: string;
  refs: readonly LibraryBinding[];
  graph: readonly LibraryNode[];
  limit: number;
  onChange: (refs: readonly LibraryBinding[]) => void;
  onChoose: () => void;
  onCreate: () => void;
}) {
  const move = (index: number, delta: number) => {
    const next = [...refs];
    const ref = next[index];
    if (!ref) return;
    next.splice(index, 1);
    next.splice(index + delta, 0, ref);
    onChange(next);
  };
  return (
    <section className="space-y-3 rounded-sm border p-4">
      <h3 className="font-sans text-sm font-semibold">{label}</h3>
      {refs.map((ref, index) => (
        <div key={ref.id} className="space-y-3 border-b pb-4">
          <BoundRevision reference={ref} graph={graph} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={index === 0}
              aria-label={`Move ${label} item ${index + 1} up`}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={index === refs.length - 1}
              aria-label={`Move ${label} item ${index + 1} down`}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(refs.filter((_, i) => i !== index))}
            >
              Remove binding
            </Button>
          </div>
        </div>
      ))}
      {!refs.length && (
        <p className="text-sm text-muted-foreground">Nothing added to this field yet.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={refs.length >= limit && limit !== 1}
          onClick={onChoose}
        >
          {limit === 1 && refs.length ? "Choose replacement" : "Choose from library"}
        </Button>
        <Button type="button" variant="ghost" disabled={refs.length >= limit} onClick={onCreate}>
          {label.startsWith("Entries") ? "Create entry" : "Write new wording"}
        </Button>
      </div>
    </section>
  );
}
function BoundRevision({
  reference,
  graph,
}: {
  reference: LibraryReference;
  graph: readonly LibraryNode[];
}) {
  const existing = graph.find((entry) => entry.revision.id === reference.revisionId);
  const result = useLibraryDetail(
    existing ? null : { id: reference.itemId, revisionId: reference.revisionId },
  );
  const entry =
    existing ??
    (result.data ? { item: result.data.item, revision: result.data.revision } : undefined);
  return (
    <div className="space-y-2">
      <Failure error={result.error} />
      {entry ? (
        <>
          <p className="text-sm font-medium">{entry.revision.label}</p>
          <p className="eyebrow">Exact revision {entry.revision.id.slice(-8)}</p>
          <LibraryDataView
            data={entry.revision.data}
            graph={existing ? graph : (result.data?.graph ?? [])}
          />
        </>
      ) : (
        <p className="text-sm">Loading bound revision…</p>
      )}
    </div>
  );
}
